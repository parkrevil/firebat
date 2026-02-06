import type { LintAnalysis } from '../../types';

import { runOxlint } from '../../infrastructure/oxlint/oxlint-runner';

export const createEmptyLint = (): LintAnalysis => ({
  status: 'ok',
  tool: 'oxlint',
  diagnostics: [],
});

export const analyzeLint = async (input: { readonly targets: ReadonlyArray<string>; readonly fix: boolean }): Promise<LintAnalysis> => {
  const result = await runOxlint({ targets: input.targets, ...(input.fix ? { fix: true } : {}) });

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
