import * as path from 'node:path';
import { readdir } from 'node:fs/promises';

import { hashString } from '../../engine/hasher';
import type { FileIndexRepository } from '../../ports/file-index.repository';

const normalizePath = (filePath: string): string => filePath.replaceAll('\\', '/');

const listRootTsconfigs = async (rootAbs: string): Promise<string[]> => {
  try {
    const entries = await readdir(rootAbs, { withFileTypes: true });

    return entries
      .filter(e => e.isFile() && e.name.startsWith('tsconfig') && e.name.endsWith('.json'))
      .map(e => path.resolve(rootAbs, e.name));
  } catch {
    return [];
  }
};

const listProjectInputFiles = async (rootAbs: string): Promise<string[]> => {
  const candidates: string[] = [
    path.resolve(rootAbs, 'package.json'),
    path.resolve(rootAbs, 'bun.lockb'),
    path.resolve(rootAbs, 'package-lock.json'),
    path.resolve(rootAbs, 'pnpm-lock.yaml'),
    path.resolve(rootAbs, 'yarn.lock'),
  ];

  const tsconfigs = await listRootTsconfigs(rootAbs);

  return [...new Set([...candidates, ...tsconfigs])];
};

const computeProjectInputsDigest = async (input: {
  projectKey: string;
  rootAbs: string;
  fileIndexRepository: FileIndexRepository;
}): Promise<string> => {
  const files = await listProjectInputFiles(input.rootAbs);
  const parts: string[] = [];

  for (const filePathAbs of files) {
    const filePath = normalizePath(filePathAbs);

    try {
      const existing = await input.fileIndexRepository.getFile({ projectKey: input.projectKey, filePath });

      if (existing) {
        parts.push(`project:${filePath}:${existing.contentHash}`);

        continue;
      }

      const stats = await Bun.file(filePathAbs).stat();
      const content = await Bun.file(filePathAbs).text();
      const contentHash = hashString(content);

      await input.fileIndexRepository.upsertFile({
        projectKey: input.projectKey,
        filePath,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        contentHash,
      });

      parts.push(`project:${filePath}:${contentHash}`);
    } catch {
      // Non-existent project files are part of the digest too (stable miss).
      parts.push(`project:missing:${filePath}`);
    }
  }

  return hashString(parts.sort().join('|'));
};

export { computeProjectInputsDigest };
