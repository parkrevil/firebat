import type { LintAnalysis } from '../../types';

import { runOxlint } from '../../infrastructure/oxlint/oxlint-runner';

export const createEmptyLint = (): LintAnalysis => ({
  status: 'ok',
  tool: 'oxlint',
  diagnostics: [],
});

export const analyzeLint = async (targets: ReadonlyArray<string>): Promise<LintAnalysis> => {
  const result = await runOxlint({ targets });

  if (!result.ok) {
    const error = result.error ?? 'oxlint failed';
    const status = error.includes('not available') ? 'unavailable' : 'failed';

    return {
      status,
      tool: 'oxlint',
      ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      error,
      diagnostics: result.diagnostics ?? [],
    };
  }

  return {
    status: 'ok',
    tool: 'oxlint',
    ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
    diagnostics: result.diagnostics ?? [],
  };
};
