import * as path from 'node:path';

import { getIndexStatsFromIndexUseCase, searchSymbolFromIndexUseCase } from '../symbol-index/symbol-index.usecases';
import type { FirebatLogger } from '../../ports/logger';

const resolveRootAbs = (root: string | undefined): string => {
  const cwd = process.cwd();

  if (root === undefined || root.trim().length === 0) {return cwd;}

  const trimmed = root.trim();

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
};

interface GetSymbolsOverviewInput {
  readonly root?: string;
  readonly logger: FirebatLogger;
}

interface QuerySymbolsInput {
  readonly root?: string;
  readonly query: string;
  readonly kind?: string | ReadonlyArray<string>;
  readonly file?: string;
  readonly limit?: number;
  readonly logger: FirebatLogger;
}

export const getSymbolsOverviewUseCase = async (input: GetSymbolsOverviewInput) => {
  input.logger.debug('symbols:overview');

  const rootAbs = resolveRootAbs(input.root);
  const stats = await getIndexStatsFromIndexUseCase({ root: rootAbs });

  return {
    root: rootAbs,
    index: stats,
  };
};

export const querySymbolsUseCase = async (input: QuerySymbolsInput) => {
  input.logger.debug('symbols:query', { query: input.query, kind: input.kind });
  const rootAbs = resolveRootAbs(input.root);
  const matches = await searchSymbolFromIndexUseCase({
    root: rootAbs,
    query: input.query,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  });
  const kindsRaw = input.kind === undefined ? [] : Array.isArray(input.kind) ? input.kind : [input.kind];
  const kinds = new Set(kindsRaw.map(k => k.toLowerCase()));
  const fileNeedle = (input.file ?? '').trim().toLowerCase();
  const filtered = matches.filter(m => {
    if (kinds.size > 0 && !kinds.has(m.kind.toLowerCase())) {return false;}

    if (fileNeedle && !m.filePath.toLowerCase().includes(fileNeedle)) {return false;}

    return true;
  });

  return { matches: filtered };
};

export type { GetSymbolsOverviewInput, QuerySymbolsInput };
