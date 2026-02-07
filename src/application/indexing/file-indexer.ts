import { hashString } from '../../engine/hasher';
import { runWithConcurrency } from '../../engine/promise-pool';
import type { FileIndexRepository } from '../../ports/file-index.repository';

interface IndexTargetsInput {
  readonly projectKey: string;
  readonly targets: ReadonlyArray<string>;
  readonly repository: FileIndexRepository;
  readonly concurrency?: number;
}

const indexTargets = async (input: IndexTargetsInput): Promise<void> => {
  const concurrency = input.concurrency ?? 8;

  await runWithConcurrency(input.targets, concurrency, async filePath => {
    try {
      const file = Bun.file(filePath);
      const [stats, existing] = await Promise.all([
        file.stat(),
        input.repository.getFile({ projectKey: input.projectKey, filePath }),
      ]);
      const mtimeMs = stats.mtimeMs;
      const size = stats.size;

      if (existing && existing.mtimeMs === mtimeMs && existing.size === size) {
        return;
      }

      const content = await file.text();
      const contentHash = hashString(content);

      await input.repository.upsertFile({
        projectKey: input.projectKey,
        filePath,
        mtimeMs,
        size,
        contentHash,
      });
    } catch {
      await input.repository.deleteFile({ projectKey: input.projectKey, filePath });
    }
  });
};

export { indexTargets };
