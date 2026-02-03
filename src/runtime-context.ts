import { loadFirebatConfig, type FirebatConfig } from './firebat-config';
import { resolveFirebatRootFromCwd } from './root-resolver';

export interface FirebatRuntimeContext {
  readonly rootAbs: string;
  readonly config: FirebatConfig;
  readonly reason: 'declared-dependency' | 'self-repo';
}

export const resolveRuntimeContextFromCwd = async (startDirAbs: string = process.cwd()): Promise<FirebatRuntimeContext> => {
  const resolved = await resolveFirebatRootFromCwd(startDirAbs);
  const config = await loadFirebatConfig(resolved.rootAbs);

  return { rootAbs: resolved.rootAbs, config, reason: resolved.reason };
};
