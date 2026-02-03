import type { FirebatConfig } from './firebat-config';

export const computeToolVersion = (config: FirebatConfig | undefined): string => {
  const baseToolVersion = '2.0.0-strict';
  const defaultCacheVersion = '2026-02-02-tsgo-lsp-v1';
  const cacheBuster = (config?.cacheBuster ?? '').trim();

  return cacheBuster.length > 0 ? `${baseToolVersion}+${cacheBuster}` : `${baseToolVersion}+${defaultCacheVersion}`;
};
