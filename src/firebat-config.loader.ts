import * as path from 'node:path';

import { FirebatConfigSchema, type FirebatConfig } from './firebat-config';

export const DEFAULT_FIREBAT_RC_BASENAME = '.firebatrc.jsonc';

export const resolveDefaultFirebatRcPath = (rootAbs: string): string => path.join(rootAbs, DEFAULT_FIREBAT_RC_BASENAME);

const stripJsoncComments = (input: string): string => {
  let out = '';
  let i = 0;

  let inString = false;
  let stringQuote: '"' | "'" | null = null;
  let escaping = false;

  while (i < input.length) {
    const ch = input[i] ?? '';
    const next = input[i + 1] ?? '';

    if (inString) {
      out += ch;

      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (stringQuote && ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }

      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch as '"' | "'";
      out += ch;
      i += 1;
      continue;
    }

    // Line comment: //...
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < input.length) {
        const c = input[i] ?? '';
        if (c === '\n' || c === '\r') {
          break;
        }
        i += 1;
      }
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < input.length) {
        const c = input[i] ?? '';
        const n = input[i + 1] ?? '';
        if (c === '*' && n === '/') {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
};

const removeTrailingCommas = (input: string): string => {
  let out = '';
  let i = 0;

  let inString = false;
  let stringQuote: '"' | "'" | null = null;
  let escaping = false;

  while (i < input.length) {
    const ch = input[i] ?? '';

    if (inString) {
      out += ch;

      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (stringQuote && ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }

      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch as '"' | "'";
      out += ch;
      i += 1;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < input.length) {
        const look = input[j] ?? '';
        if (look === ' ' || look === '\t' || look === '\n' || look === '\r') {
          j += 1;
          continue;
        }

        // Skip commas before closing brackets/braces.
        if (look === '}' || look === ']') {
          i += 1;
          // Do not emit this comma.
          break;
        }

        out += ch;
        i += 1;
        break;
      }

      if (j >= input.length) {
        // Trailing comma at EOF: drop.
        i += 1;
      }

      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
};

export const parseJsonc = (text: string): unknown => {
  const withoutComments = stripJsoncComments(text);
  const withoutTrailingCommas = removeTrailingCommas(withoutComments);

  return JSON.parse(withoutTrailingCommas);
};

export const loadFirebatConfigFile = async (params: {
  readonly rootAbs: string;
  readonly configPath?: string;
}): Promise<{ config: FirebatConfig | null; resolvedPath: string; exists: boolean }> => {
  const resolvedPath = params.configPath !== undefined ? path.resolve(params.configPath) : resolveDefaultFirebatRcPath(params.rootAbs);
  const file = Bun.file(resolvedPath);

  if (!(await file.exists())) {
    return { config: null, resolvedPath, exists: false };
  }

  const raw = await file.text();
  let parsed: unknown;

  try {
    parsed = parseJsonc(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    throw new Error(`[firebat] Failed to parse config: ${resolvedPath}\n${message}`);
  }

  const validated = FirebatConfigSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error(`[firebat] Invalid config: ${resolvedPath}\n${validated.error.message}`);
  }

  return { config: validated.data, resolvedPath, exists: true };
};
