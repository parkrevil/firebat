import * as path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { resolveRuntimeContextFromCwd } from '../../runtime-context';
import { getOrmDb } from '../../infrastructure/sqlite/firebat.db';
import { parseJsonc } from '../../firebat-config.loader';

import { loadFirstExistingText, resolveAssetCandidates } from './install-assets';

type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

type JsonMaybe = JsonValue | undefined;

interface AssetTemplateMeta {
  readonly sourcePath: string;
  readonly sha256: string;
}

interface AssetInstallInstalled {
  readonly kind: 'installed';
  readonly filePath: string;
  readonly desiredSha256: string;
}

interface AssetInstallSkippedSame {
  readonly kind: 'skipped-exists-same';
  readonly filePath: string;
  readonly desiredSha256: string;
  readonly existingSha256: string;
}

interface AssetInstallSkippedDifferent {
  readonly kind: 'skipped-exists-different';
  readonly filePath: string;
  readonly desiredSha256: string;
  readonly existingSha256: string;
}

type AssetInstallResult = AssetInstallInstalled | AssetInstallSkippedSame | AssetInstallSkippedDifferent;

const sha256Hex = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(digest));

  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item));
  }

  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJsonValue(v);
    }
    return out;
  }

  throw new Error('[firebat] Invalid JSON value (non-JSON type encountered)');
};

const deepEqual = (a: JsonValue, b: JsonValue): boolean => {
  if (a === b) return true;

  if (a === null || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i]!, b[i]!)) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    if (typeof b !== 'object' || Array.isArray(b)) return false;
    const aKeys = Object.keys(a as any).sort();
    const bKeys = Object.keys(b as any).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i += 1) {
      if (aKeys[i] !== bKeys[i]) return false;
    }
    for (const k of aKeys) {
      const av = (a as any)[k] as JsonValue;
      const bv = (b as any)[k] as JsonValue;
      if (!deepEqual(av, bv)) return false;
    }
    return true;
  }

  return false;
};

const sortJsonValue = (value: JsonValue): JsonValue => {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(v => sortJsonValue(v));

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of entries) {
    out[k] = sortJsonValue(v);
  }
  return out;
};

const jsonText = (value: JsonValue): string => JSON.stringify(sortJsonValue(value), null, 2) + '\n';

const parseJsoncOrThrow = (filePath: string, text: string): JsonValue => {
  try {
    return toJsonValue(parseJsonc(text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[firebat] Failed to parse JSONC: ${filePath}: ${msg}`);
  }
};

const parseYesFlag = (argv: readonly string[]): { yes: boolean; help: boolean } => {
  let yes = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '-y' || arg === '--yes') {
      yes = true;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`[firebat] Unknown option: ${arg}`);
    }
  }

  return { yes, help };
};

const ensureGitignoreHasFirebat = async (rootAbs: string): Promise<boolean> => {
  const gitignorePath = path.join(rootAbs, '.gitignore');
  const entry = '.firebat/';

  try {
    const current = await readFile(gitignorePath, 'utf8');

    if (current.split(/\r?\n/).some(line => line.trim() === entry)) {
      return false;
    }

    const next = current.endsWith('\n') ? `${current}${entry}\n` : `${current}\n${entry}\n`;

    await writeFile(gitignorePath, next, 'utf8');

    return true;
  } catch {
    await writeFile(gitignorePath, `${entry}\n`, 'utf8');

    return true;
  }
};

const installTextFileNoOverwrite = async (destPath: string, desiredText: string): Promise<AssetInstallResult> => {
  const dest = Bun.file(destPath);
  const desiredSha256 = await sha256Hex(desiredText);

  if (await dest.exists()) {
    try {
      const existingText = await dest.text();
      const existingSha256 = await sha256Hex(existingText);

      if (existingText === desiredText) {
        return { kind: 'skipped-exists-same', filePath: destPath, desiredSha256, existingSha256 };
      }

      return { kind: 'skipped-exists-different', filePath: destPath, desiredSha256, existingSha256 };
    } catch {
      return { kind: 'skipped-exists-different', filePath: destPath, desiredSha256, existingSha256: 'unreadable' };
    }
  }

  await Bun.write(destPath, desiredText);

  return { kind: 'installed', filePath: destPath, desiredSha256 };
};

const ensureBaseSnapshot = async (input: {
  readonly rootAbs: string;
  readonly firebatDir: string;
  readonly assetFileName: string;
  readonly templateText: string;
}): Promise<{ sha256: string; filePath: string }> => {
  const baseDir = path.join(input.firebatDir, 'install-bases');
  await mkdir(baseDir, { recursive: true });

  const parsed = parseJsoncOrThrow(`assets/${input.assetFileName}`, input.templateText);
  const normalizedText = jsonText(parsed);
  const sha256 = await sha256Hex(normalizedText);
  const filePath = path.join(baseDir, `${input.assetFileName}.${sha256}.json`);

  const f = Bun.file(filePath);
  if (!(await f.exists())) {
    await Bun.write(filePath, normalizedText);
  }

  return { sha256, filePath };
};

const printInstallHelp = (): void => {
  console.log(['firebat install', '', 'Usage:', '  firebat install [-y|--yes]', '  firebat i [-y|--yes]'].join('\n'));
};

const printUpdateHelp = (): void => {
  console.log(['firebat update', '', 'Usage:', '  firebat update [-y|--yes]', '  firebat u [-y|--yes]'].join('\n'));
};

type AssetSpec = Readonly<{ asset: string; dest: string }>;

const ASSETS: ReadonlyArray<AssetSpec> = [
  { asset: '.oxlintrc.jsonc', dest: '.oxlintrc.jsonc' },
  { asset: '.oxfmtrc.jsonc', dest: '.oxfmtrc.jsonc' },
  { asset: '.firebatrc.jsonc', dest: '.firebatrc.jsonc' },
];

const deepEqualMaybe = (a: JsonMaybe, b: JsonMaybe): boolean => {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return deepEqual(a, b);
};

const toJsonPreview = (value: JsonMaybe): string => {
  if (value === undefined) return '<missing>';
  try {
    const json = JSON.stringify(sortJsonValue(value));
    if (json.length <= 240) return json;
    return `${json.slice(0, 240)}…`;
  } catch {
    return '<unstringifiable>';
  }
};

interface MergeConflict {
  readonly path: string;
  readonly base: JsonMaybe;
  readonly user: JsonMaybe;
  readonly template: JsonMaybe;
}

const merge3 = (input: {
  readonly base: JsonMaybe;
  readonly user: JsonMaybe;
  readonly next: JsonMaybe;
  readonly path: readonly string[];
}): { ok: true; value: JsonMaybe } | { ok: false; conflicts: MergeConflict[] } => {
  const { base, user, next } = input;
  const pathStr = input.path.length === 0 ? '<root>' : input.path.join('.');

  if (deepEqualMaybe(user, next)) {
    return { ok: true, value: user };
  }

  if (deepEqualMaybe(base, user)) {
    return { ok: true, value: next };
  }

  if (deepEqualMaybe(base, next)) {
    return { ok: true, value: user };
  }

  const baseIsObj = typeof base === 'object' && base !== null && base !== undefined && !Array.isArray(base);
  const userIsObj = typeof user === 'object' && user !== null && user !== undefined && !Array.isArray(user);
  const nextIsObj = typeof next === 'object' && next !== null && next !== undefined && !Array.isArray(next);

  if (baseIsObj && userIsObj && nextIsObj) {
    const keys = new Set<string>([...Object.keys(base as any), ...Object.keys(user as any), ...Object.keys(next as any)]);
    const out: Record<string, JsonValue> = {};
    const conflicts: MergeConflict[] = [];

    for (const key of Array.from(keys).sort()) {
      const b = (base as any)[key] as JsonMaybe;
      const u = (user as any)[key] as JsonMaybe;
      const n = (next as any)[key] as JsonMaybe;
      const merged = merge3({ base: b, user: u, next: n, path: [...input.path, key] });

      if (!merged.ok) {
        conflicts.push(...merged.conflicts);
        continue;
      }

      if (merged.value !== undefined) {
        out[key] = merged.value;
      }
    }

    if (conflicts.length > 0) {
      return { ok: false, conflicts };
    }

    return { ok: true, value: out };
  }

  const baseIsArr = Array.isArray(base);
  const userIsArr = Array.isArray(user);
  const nextIsArr = Array.isArray(next);

  if (baseIsArr && userIsArr && nextIsArr) {
    return { ok: false, conflicts: [{ path: pathStr, base, user, template: next }] };
  }

  return { ok: false, conflicts: [{ path: pathStr, base, user, template: next }] };
};

const explainConflict = (filePath: string, conflicts: readonly MergeConflict[]): string => {
  const lines = [`[firebat] update aborted: conflicts in ${filePath}`, '[firebat] A conflict means user+template both changed from base.'];
  for (const c of conflicts) {
    lines.push(`[firebat]  - ${c.path}`);
    lines.push(`    base:     ${toJsonPreview(c.base)}`);
    lines.push(`    user:     ${toJsonPreview(c.user)}`);
    lines.push(`    template: ${toJsonPreview(c.template)}`);
  }
  lines.push('[firebat] Run `firebat install` to reset templates, then try again.');
  return lines.join('\n');
};

const runInstallLike = async (mode: 'install' | 'update', argv: readonly string[]): Promise<number> => {
  try {
    const { yes, help } = parseYesFlag(argv);
    void yes;

    if (help) {
      if (mode === 'install') printInstallHelp();
      else printUpdateHelp();
      return 0;
    }

    const ctx = await resolveRuntimeContextFromCwd();
    const rootAbs = ctx.rootAbs;
    const firebatDir = path.join(rootAbs, '.firebat');

    await mkdir(firebatDir, { recursive: true });

    const assetResults: AssetInstallResult[] = [];
    const assetManifest: Record<string, AssetTemplateMeta> = {};
    const baseSnapshots: Record<string, { sha256: string; filePath: string }> = {};

    const loadedTemplates: Array<{ asset: string; destAbs: string; templateText: string; templatePath: string }> = [];

    for (const item of ASSETS) {
      const loaded = await loadFirstExistingText(resolveAssetCandidates(item.asset));
      loadedTemplates.push({
        asset: item.asset,
        destAbs: path.join(rootAbs, item.dest),
        templateText: loaded.text,
        templatePath: loaded.filePath,
      });
    }

    if (mode === 'update') {
      const manifestPath = path.join(firebatDir, 'install-manifest.json');
      const mf = Bun.file(manifestPath);
      if (!(await mf.exists())) {
        console.error('[firebat] update aborted: no install manifest found. Run `firebat install` first.');
        return 1;
      }

      let manifest: any;
      try {
        manifest = await mf.json();
      } catch {
        console.error('[firebat] update aborted: install manifest is unreadable. Run `firebat install` first.');
        return 1;
      }

      const bases = manifest?.baseSnapshots;
      if (!bases || typeof bases !== 'object') {
        console.error('[firebat] update aborted: no base snapshots found. Run `firebat install` first.');
        return 1;
      }

      // Compute all merged results first (rollback policy).
      const plannedWrites: Array<{ filePath: string; text: string }> = [];
      const nextBaseWrites: Array<{ filePath: string; text: string; asset: string; sha256: string }> = [];

      for (const tpl of loadedTemplates) {
        const baseMeta = (bases as any)[tpl.asset];
        const basePath = typeof baseMeta?.filePath === 'string' ? baseMeta.filePath : null;

        if (!basePath) {
          console.error(`[firebat] update aborted: missing base snapshot for ${tpl.asset}. Run \`firebat install\` first.`);
          return 1;
        }

        const baseFile = Bun.file(basePath);
        if (!(await baseFile.exists())) {
          console.error(`[firebat] update aborted: base snapshot not found for ${tpl.asset}. Run \`firebat install\` first.`);
          return 1;
        }

        const baseText = await baseFile.text();
        const nextParsed = parseJsoncOrThrow(`assets/${tpl.asset}`, tpl.templateText);
        const baseParsed = parseJsoncOrThrow(basePath, baseText);

        const destFile = Bun.file(tpl.destAbs);
        const userText = (await destFile.exists()) ? await destFile.text() : null;
        const userParsed = userText === null ? undefined : parseJsoncOrThrow(tpl.destAbs, userText);

        const merged = merge3({ base: baseParsed, user: userParsed, next: nextParsed, path: [] });
        if (!merged.ok) {
          console.error(explainConflict(tpl.destAbs, merged.conflicts));
          return 1;
        }

        const mergedValue = merged.value;
        if (mergedValue === undefined) {
          console.error(explainConflict(tpl.destAbs, [{ path: '<root>', base: baseParsed, user: userParsed, template: nextParsed }]));
          return 1;
        }

        // Compare semantic equality to avoid rewriting identical content.
        if (userParsed === undefined || !deepEqual(userParsed, mergedValue)) {
          plannedWrites.push({ filePath: tpl.destAbs, text: jsonText(mergedValue) });
        }

        const nextNormalized = jsonText(nextParsed);
        const nextSha = await sha256Hex(nextNormalized);
        const nextBasePath = path.join(firebatDir, 'install-bases', `${tpl.asset}.${nextSha}.json`);
        nextBaseWrites.push({ filePath: nextBasePath, text: nextNormalized, asset: tpl.asset, sha256: nextSha });
      }

      // Apply writes.
      for (const w of plannedWrites) {
        await Bun.write(w.filePath, w.text);
        assetResults.push({ kind: 'installed', filePath: w.filePath, desiredSha256: await sha256Hex(w.text) });
      }

      await mkdir(path.join(firebatDir, 'install-bases'), { recursive: true });

      for (const b of nextBaseWrites) {
        const f = Bun.file(b.filePath);
        if (!(await f.exists())) {
          await Bun.write(b.filePath, b.text);
        }
        baseSnapshots[b.asset] = { sha256: b.sha256, filePath: b.filePath };
      }

      for (const tpl of loadedTemplates) {
        const nextParsed = parseJsoncOrThrow(`assets/${tpl.asset}`, tpl.templateText);
        const nextNormalized = jsonText(nextParsed);
        assetManifest[tpl.asset] = { sourcePath: tpl.templatePath, sha256: await sha256Hex(nextNormalized) };
      }
    } else {
      for (const tpl of loadedTemplates) {
        const base = await ensureBaseSnapshot({ rootAbs, firebatDir, assetFileName: tpl.asset, templateText: tpl.templateText });
        baseSnapshots[tpl.asset] = base;

        const desiredParsed = parseJsoncOrThrow(`assets/${tpl.asset}`, tpl.templateText);
        const desiredText = jsonText(desiredParsed);

        assetManifest[tpl.asset] = { sourcePath: tpl.templatePath, sha256: await sha256Hex(desiredText) };
        assetResults.push(await installTextFileNoOverwrite(tpl.destAbs, desiredText));
      }
    }

    const gitignoreUpdated = await ensureGitignoreHasFirebat(rootAbs);

    // DB warm-up (creates .firebat/firebat.sqlite + runs migrations)
    await getOrmDb({ rootAbs });

    const installManifestPath = path.join(firebatDir, 'install-manifest.json');
    const manifestOut = {
      installedAt: new Date().toISOString(),
      rootAbs,
      assetTemplates: assetManifest,
      baseSnapshots,
      results: assetResults,
      gitignoreUpdated,
    };

    await Bun.write(installManifestPath, JSON.stringify(manifestOut, null, 2) + '\n');

    console.log(`[firebat] ${mode} root: ${rootAbs}`);
    console.log(`[firebat] created/verified: ${firebatDir}`);

    if (gitignoreUpdated) {
      console.log('[firebat] updated .gitignore: added .firebat/');
    }

    if (mode === 'install') {
      const diffs = assetResults.filter(r => r.kind === 'skipped-exists-different');
      for (const r of assetResults) {
        if (r.kind === 'installed') console.log(`[firebat] installed ${r.filePath}`);
        else if (r.kind === 'skipped-exists-same') console.log(`[firebat] kept existing (same) ${r.filePath}`);
        else console.log(`[firebat] kept existing (DIFFERENT) ${r.filePath}`);
      }
      if (diffs.length > 0) {
        console.log('[firebat] NOTE: Some files differ from the current templates. Per policy, install never overwrites.');
        console.log(`[firebat] See ${installManifestPath} for template hashes and paths.`);
      }
    } else {
      if (assetResults.length === 0) {
        console.log('[firebat] update: no changes');
      } else {
        for (const r of assetResults) {
          console.log(`[firebat] updated ${r.filePath}`);
        }
      }
    }

    console.log('');
    console.log('[firebat] MCP SSOT: If you register this project context in your MCP SSOT, agents can use it more proactively.');

    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 1;
  }
};

export const runInstall = async (argv: readonly string[] = []): Promise<number> => {
  return runInstallLike('install', argv);
};

export const runUpdate = async (argv: readonly string[] = []): Promise<number> => {
  return runInstallLike('update', argv);
};
