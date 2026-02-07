import * as path from 'node:path';

import type { FirebatLogger } from '../../ports/logger';

interface OxfmtRunResult {
  readonly ok: boolean;
  readonly tool: 'oxfmt';
  readonly exitCode?: number;
  readonly error?: string;
  readonly rawStdout?: string;
  readonly rawStderr?: string;
}

interface RunOxfmtInput {
  readonly targets: ReadonlyArray<string>;
  readonly configPath?: string;
  readonly mode: 'check' | 'write';
  readonly logger: FirebatLogger;
}

const tryResolveOxfmtCommand = async (): Promise<string[] | null> => {
  const candidates = [
    // project-local
    path.resolve(process.cwd(), 'node_modules', '.bin', 'oxfmt'),

    // firebat package-local (dist/* sibling to node_modules/*)
    path.resolve(import.meta.dir, '../../../node_modules', '.bin', 'oxfmt'),
    path.resolve(import.meta.dir, '../../node_modules', '.bin', 'oxfmt'),
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
    const resolved = Bun.which('oxfmt');

    if (resolved !== null && resolved.length > 0) {
      return [resolved];
    }
  }

  return null;
};

const runOxfmt = async (input: RunOxfmtInput): Promise<OxfmtRunResult> => {
  const { logger } = input;

  logger.debug('oxfmt: resolving command');
  const cmd = await tryResolveOxfmtCommand();

  if (!cmd || cmd.length === 0) {
    logger.warn('oxfmt: command not found — format tool unavailable');

    return {
      ok: false,
      tool: 'oxfmt',
      error: 'oxfmt is not available. Install it (or use a firebat build that bundles it) to enable the format tool.',
    };
  }

  logger.trace('oxfmt: resolved command', { cmd: cmd[0] });

  const args: string[] = [];

  if (input.configPath !== undefined && input.configPath.trim().length > 0) {
    args.push('--config', input.configPath);
  }

  if (input.mode === 'check') {
    args.push('--check');
  } else {
    // Explicitly request in-place writes (documented default, but keeping explicit for clarity).
    args.push('--write');
  }

  args.push(...input.targets);

  logger.debug('oxfmt: spawning process', { mode: input.mode, targetCount: input.targets.length });

  try {
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

    logger.debug('oxfmt: process exited', { exitCode });

    return {
      ok: true,
      tool: 'oxfmt',
      exitCode,
      rawStdout: stdout,
      rawStderr: stderr,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error(`oxfmt: spawn failed: ${message}`, undefined, err);

    return {
      ok: false,
      tool: 'oxfmt',
      error: message,
    };
  }
};

export { runOxfmt };
export type { OxfmtRunResult, RunOxfmtInput };
