import type { FormatAnalysis } from '../../types';

import { runOxfmt } from '../../infrastructure/oxfmt/oxfmt-runner';

export const createEmptyFormat = (): FormatAnalysis => ({
  status: 'ok',
  tool: 'oxfmt',
});

export const analyzeFormat = async (input: {
  readonly targets: ReadonlyArray<string>;
  readonly fix: boolean;
  readonly configPath?: string;
}): Promise<FormatAnalysis> => {
  const result = await runOxfmt({
    targets: input.targets,
    mode: input.fix ? 'write' : 'check',
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
  });

  if (!result.ok) {
    const error = result.error ?? 'oxfmt failed';
    const status = error.includes('not available') ? 'unavailable' : 'failed';

    return {
      status,
      tool: 'oxfmt',
      error,
      ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      ...(typeof result.rawStdout === 'string' ? { rawStdout: result.rawStdout } : {}),
      ...(typeof result.rawStderr === 'string' ? { rawStderr: result.rawStderr } : {}),
    };
  }

  if (!input.fix) {
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;

    return {
      status: exitCode === 0 ? 'ok' : 'needs-formatting',
      tool: 'oxfmt',
      ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      ...(typeof result.rawStdout === 'string' ? { rawStdout: result.rawStdout } : {}),
      ...(typeof result.rawStderr === 'string' ? { rawStderr: result.rawStderr } : {}),
    };
  }

  return {
    status: 'ok',
    tool: 'oxfmt',
    ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
    ...(typeof result.rawStdout === 'string' ? { rawStdout: result.rawStdout } : {}),
    ...(typeof result.rawStderr === 'string' ? { rawStderr: result.rawStderr } : {}),
  };
};
