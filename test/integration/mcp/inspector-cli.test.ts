import * as path from 'node:path';

import { expect, test } from 'bun:test';

import * as z from 'zod';

// NOTE:
// - This test uses @modelcontextprotocol/inspector in CLI mode.
// - The inspector package requires Node.js (see its README). Because this repo is Bun-first,
//   we keep the test opt-in to avoid forcing Node in all environments.

const isInspectorCliEnabled = async (): Promise<boolean> => {
  try {
    const rootAbs = path.resolve(import.meta.dir, '../../../..');
    const configPath = path.join(rootAbs, '.firebat', 'config.json');
    const file = Bun.file(configPath);

    if (!(await file.exists())) {
      return false;
    }

    const schema = z.looseObject({
      enableInspectorCliTest: z.boolean().optional(),
    });
    const parsed = schema.safeParse(await file.json());

    return parsed.success && parsed.data.enableInspectorCliTest === true;
  } catch {
    return false;
  }
};

const maybeTest = (await isInspectorCliEnabled()) ? test : test.skip;

maybeTest('should list tools when running inspector CLI (opt-in)', async () => {
  // Arrange

  const serverEntry = path.resolve(import.meta.dir, '../../../index.ts');
  const proc = Bun.spawn({
    cmd: [
      'npx',
      '@modelcontextprotocol/inspector',
      '--cli',
      'bun',
      serverEntry,
      'mcp',
      '--method',
      'tools/list',
    ],
    cwd: process.cwd(),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Act
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  // Assert
  expect(exitCode).toBe(0);

  // CLI prints JSON to stdout on success.
  expect(stdout.length).toBeGreaterThan(0);

  // Stderr should be mostly empty; allow warnings.
  expect(typeof stderr).toBe('string');
});
