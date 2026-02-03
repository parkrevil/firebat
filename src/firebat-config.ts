import * as path from 'node:path';

import * as z from 'zod';

interface FirebatConfig {
  readonly cacheBuster?: string;
  readonly dbPath?: string;
  readonly oxlintCommand?: string;
  readonly fuzzSeed?: number;
  readonly fuzzIters?: number;
  readonly enableInspectorCliTest?: boolean;
}

const FirebatConfigSchema = z.looseObject({
  cacheBuster: z.string().trim().min(1).optional(),
  dbPath: z.string().trim().min(1).optional(),
  oxlintCommand: z.string().trim().min(1).optional(),
  fuzzSeed: z.number().int().nonnegative().optional(),
  fuzzIters: z.number().int().positive().optional(),
  enableInspectorCliTest: z.boolean().optional(),
});

const resolveFirebatConfigPath = (rootAbs: string): string => path.join(rootAbs, '.firebat', 'config.json');

const loadFirebatConfig = async (rootAbs: string): Promise<FirebatConfig> => {
  const configPath = resolveFirebatConfigPath(rootAbs);

  try {
    const file = Bun.file(configPath);

    if (!(await file.exists())) {
      return {};
    }

    const raw = await file.text();
    const parsed = FirebatConfigSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      return {};
    }

    return {
      ...(parsed.data.cacheBuster !== undefined ? { cacheBuster: parsed.data.cacheBuster } : {}),
      ...(parsed.data.dbPath !== undefined ? { dbPath: parsed.data.dbPath } : {}),
      ...(parsed.data.oxlintCommand !== undefined ? { oxlintCommand: parsed.data.oxlintCommand } : {}),
      ...(parsed.data.fuzzSeed !== undefined ? { fuzzSeed: parsed.data.fuzzSeed } : {}),
      ...(parsed.data.fuzzIters !== undefined ? { fuzzIters: parsed.data.fuzzIters } : {}),
      ...(parsed.data.enableInspectorCliTest !== undefined
        ? { enableInspectorCliTest: parsed.data.enableInspectorCliTest }
        : {}),
    };
  } catch {
    return {};
  }
};

export { loadFirebatConfig, resolveFirebatConfigPath };
export type { FirebatConfig };
