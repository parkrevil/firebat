import { describe, test, expect } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { createFirebatProgram } from './ts-program';

interface FakeWorkerEvent<T> {
  readonly data: T;
}

class FakeWorker {
  public onmessage: ((event: FakeWorkerEvent<any>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;

  readonly url: string;
  readonly options: unknown;

  static created: FakeWorker[] = [];
  static postedPayloads: unknown[] = [];
  static simulateOkFalseOnce = false;
  static simulateOkFalseError = 'simulated worker error';

  constructor(url: URL | string, options?: unknown) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.options = options;

    FakeWorker.created.push(this);

    // default: allow all urls
  }

  postMessage(payload: unknown): void {
    FakeWorker.postedPayloads.push(payload);

    queueMicrotask(() => {
      if (!this.onmessage) {
        return;
      }

      const filePath = (payload as any)?.filePath;

      if (FakeWorker.simulateOkFalseOnce) {
        FakeWorker.simulateOkFalseOnce = false;

        this.onmessage({
          data: {
            ok: false,
            filePath: typeof filePath === 'string' ? filePath : '',
            error: FakeWorker.simulateOkFalseError,
          },
        });

        return;
      }

      this.onmessage({
        data: {
          ok: true,
          filePath: typeof filePath === 'string' ? filePath : '',
          sourceText: 'export const x = 1;\n',
          program: {},
          errors: [],
        },
      });
    });
  }

  terminate(): void {
    // noop
  }
}

describe('ts-program', () => {
  test('should post a {filePath} payload when parsing targets', async () => {
    // Arrange
    const realWorker = globalThis.Worker;

    (globalThis as any).Worker = FakeWorker;

    FakeWorker.created = [];
    FakeWorker.postedPayloads = [];

    const warns: Array<{ message: string }> = [];
    const logger = {
      level: 'trace',
      log: () => undefined,
      error: () => undefined,
      warn: (message: string) => {
        warns.push({ message });
      },
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
    };
    const filePath = path.join(process.cwd(), 'test/mcp/fixtures/sample.ts');

    try {
      // Act
      const result = await createFirebatProgram({ targets: [filePath], logger } as any);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0]?.filePath).toBe(filePath);
      expect(FakeWorker.postedPayloads[0]).toEqual({ filePath });
      expect(warns.length).toBe(0);
    } finally {
      // Cleanup
      (globalThis as any).Worker = realWorker;
    }
  });

  test('should prefer parse-worker.js when it can be constructed', async () => {
    // Arrange
    const realWorker = globalThis.Worker;

    (globalThis as any).Worker = FakeWorker;

    FakeWorker.created = [];
    FakeWorker.postedPayloads = [];

    const logger = {
      level: 'trace',
      log: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
    };
    const filePath = path.join(process.cwd(), 'test/mcp/fixtures/sample.ts');

    try {
      // Act
      await createFirebatProgram({ targets: [filePath], logger } as any);

      // Assert
      expect(FakeWorker.created.length).toBeGreaterThan(0);
      expect(FakeWorker.created[0]?.url.endsWith('workers/parse-worker.js')).toBe(true);
      expect(FakeWorker.created[0]?.options).toEqual({ type: 'module' });
    } finally {
      // Cleanup
      (globalThis as any).Worker = realWorker;
    }
  });

  test('should throw when parse-worker.js construction throws', async () => {
    // Arrange
    const realWorker = globalThis.Worker;

    class ThrowingJsWorker extends FakeWorker {
      constructor(url: URL | string, options?: unknown) {
        const urlString = typeof url === 'string' ? url : url.toString();

        if (urlString.endsWith('workers/parse-worker.js')) {
          throw new Error('simulate missing dist worker');
        }

        super(url, options);
      }
    }

    (globalThis as any).Worker = ThrowingJsWorker;

    FakeWorker.created = [];
    FakeWorker.postedPayloads = [];

    const logger = {
      level: 'trace',
      log: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
    };
    const filePath = path.join(process.cwd(), 'test/mcp/fixtures/sample.ts');

    try {
      // Act
      let thrown: unknown = null;

      try {
        await createFirebatProgram({ targets: [filePath], logger } as any);
      } catch (error) {
        thrown = error;
      }

      // Assert
      expect(thrown).toBeTruthy();
      expect(FakeWorker.created.length).toBe(0);
    } finally {
      // Cleanup
      (globalThis as any).Worker = realWorker;
    }
  });

  test('should return parsed files even when worker returns ok=false (fallback path)', async () => {
    // Arrange
    const realWorker = globalThis.Worker;

    (globalThis as any).Worker = FakeWorker;

    FakeWorker.created = [];
    FakeWorker.postedPayloads = [];
    FakeWorker.simulateOkFalseOnce = true;
    FakeWorker.simulateOkFalseError = 'simulated worker failure';

    const warns: Array<{ message: string }> = [];
    const logger = {
      level: 'trace',
      log: () => undefined,
      error: () => undefined,
      warn: (message: string) => {
        warns.push({ message });
      },
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
    };
    const tmpRootAbs = await mkdtemp(path.join(os.tmpdir(), 'firebat-ts-program-test-'));
    const fixturesAbs = path.join(tmpRootAbs, 'fixtures');

    await mkdir(fixturesAbs, { recursive: true });

    const filePath = path.join(fixturesAbs, 'fallback.ts');

    await Bun.write(filePath, 'export const x = 1;\n');

    try {
      // Act
      const result = await createFirebatProgram({ targets: [filePath], logger } as any);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0]?.filePath).toBe(filePath);
      expect(warns.length).toBe(0);
    } finally {
      // Cleanup
      await rm(tmpRootAbs, { recursive: true, force: true });

      (globalThis as any).Worker = realWorker;
    }
  });
});
