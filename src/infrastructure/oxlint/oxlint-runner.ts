import * as path from 'node:path';

import * as z from 'zod';

import type { SourceSpan } from '../../types';
import type { FirebatLogger } from '../../ports/logger';

interface OxlintDiagnostic {
  readonly filePath?: string;
  readonly message: string;
  readonly code?: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly span: SourceSpan;
}

interface OxlintRunResult {
  readonly ok: boolean;
  readonly tool: 'oxlint';
  readonly exitCode?: number;
  readonly error?: string;
  readonly rawStdout?: string;
  readonly rawStderr?: string;
  readonly diagnostics?: ReadonlyArray<OxlintDiagnostic>;
}

interface RunOxlintInput {
  readonly targets: ReadonlyArray<string>;
  readonly configPath?: string;
  readonly fix?: boolean;
  readonly logger: FirebatLogger;
}

const tryResolveOxlintCommand = async (): Promise<string[] | null> => {
  const candidates = [
    // project-local
    path.resolve(process.cwd(), 'node_modules', '.bin', 'oxlint'),

    // firebat package-local (dist/* sibling to node_modules/*)
    path.resolve(import.meta.dir, '../../../node_modules', '.bin', 'oxlint'),
    path.resolve(import.meta.dir, '../../node_modules', '.bin', 'oxlint'),
  ];

  for (const candidate of candidates) {
    try {
      const file = Bun.file(candidate);

      if (await file.exists()) {
        return [candidate];
      }
    } catch {
      // ignore
    }
  }

  if (typeof Bun.which === 'function') {
    const resolved = Bun.which('oxlint');

    if (resolved !== null && resolved.length > 0) {
      return [resolved];
    }
  }

  return null;
};

const SeveritySchema = z.enum(['error', 'warning', 'info']);
const OxlintDiagnosticSchema = z
  .object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    file: z.string().optional(),
    filename: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    code: z.string().optional(),
    ruleId: z.string().optional(),
    rule: z.string().optional(),
    severity: SeveritySchema.optional(),
    level: SeveritySchema.optional(),
    line: z.number().optional(),
    row: z.number().optional(),
    startLine: z.number().optional(),
    column: z.number().optional(),
    col: z.number().optional(),
    startColumn: z.number().optional(),
  })
  .loose();
const OxlintOutputSchema = z.union([
  z.array(OxlintDiagnosticSchema),
  z.looseObject({ diagnostics: z.array(OxlintDiagnosticSchema) }),
]);

type OxlintOutput = z.infer<typeof OxlintOutputSchema>;

const normalizeDiagnosticsFromParsed = (value: OxlintOutput): ReadonlyArray<OxlintDiagnostic> => {
  const rawList = Array.isArray(value) ? value : value.diagnostics;
  const out: OxlintDiagnostic[] = [];

  for (const item of rawList) {
    const message = item.message ?? item.text ?? 'oxlint diagnostic';
    const code = item.code ?? item.ruleId ?? item.rule;
    const severityRaw = item.severity ?? item.level;
    const severity: OxlintDiagnostic['severity'] = severityRaw ?? 'warning';
    const filePath = item.filePath ?? item.path ?? item.file ?? item.filename;
    const line = item.line ?? item.row ?? item.startLine ?? 0;
    const column = item.column ?? item.col ?? item.startColumn ?? 0;
    const normalized: OxlintDiagnostic = {
      message,
      severity,
      span: { start: { line, column }, end: { line, column } },
      ...(filePath !== undefined ? { filePath } : {}),
      ...(code !== undefined ? { code } : {}),
    };

    out.push(normalized);
  }

  return out;
};

const runOxlint = async (input: RunOxlintInput): Promise<OxlintRunResult> => {
  const { logger } = input;

  logger.debug('oxlint: resolving command');
  const cmd = await tryResolveOxlintCommand();

  if (!cmd || cmd.length === 0) {
    logger.warn('oxlint: command not found — lint tool unavailable');

    return {
      ok: false,
      tool: 'oxlint',
      error: 'oxlint is not available. Install it (or use a firebat build that bundles it) to enable the lint tool.',
    };
  }

  logger.trace('oxlint: resolved command', { cmd: cmd[0] });

  const args: string[] = [];

  if (input.configPath !== undefined && input.configPath.trim().length > 0) {
    args.push('--config', input.configPath);
  }

  // Machine-readable diagnostics.
  args.push('-f', 'json');

  if (input.fix === true) {
    args.push('--fix');
  }

  // NOTE: oxlint JSON output flags may differ by version. For now, treat stdout/stderr as raw,
  // but if stdout is valid JSON, attempt best-effort normalization.
  args.push(...input.targets);

  logger.debug('oxlint: spawning process', { targetCount: input.targets.length, fix: input.fix ?? false, configPath: input.configPath });

  const proc = Bun.spawn({
    cmd: [...cmd, ...args],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const parseDiagnostics = (text: string): ReadonlyArray<OxlintDiagnostic> => {
    const trimmed = text.trim();

    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return [];
    }

    try {
      const parsed = OxlintOutputSchema.safeParse(JSON.parse(trimmed));
      return parsed.success ? normalizeDiagnosticsFromParsed(parsed.data) : [];
    } catch {
      return [];
    }
  };

  const stdoutDiagnostics = parseDiagnostics(stdout);
  const diagnostics = stdoutDiagnostics.length > 0 ? stdoutDiagnostics : parseDiagnostics(stderr);

  logger.debug('oxlint: process exited', { exitCode, diagnosticCount: diagnostics.length });

  if (exitCode !== 0) {
    logger.trace('oxlint: non-zero exit code (may indicate findings)', { exitCode });
  }

  // Non-zero exit codes are expected when lint findings exist. Treat the run as successful
  // as long as the tool executed.
  return {
    ok: true,
    tool: 'oxlint',
    exitCode,
    rawStdout: stdout,
    rawStderr: stderr,
    diagnostics,
    ...(exitCode !== 0 ? { error: `oxlint exited with code ${exitCode}` } : {}),
  };
};

export { runOxlint };
export type { OxlintDiagnostic, OxlintRunResult, RunOxlintInput };
