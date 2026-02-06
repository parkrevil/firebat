import * as path from 'node:path';
import * as os from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ToolResultLike = {
  readonly structuredContent?: unknown;
  readonly content?: ReadonlyArray<{ readonly text?: string }>;
};

const parseJsonText = (text: string | undefined): unknown => {
  if (text === undefined || text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
};

const getStructuredContent = (result: ToolResultLike): unknown => {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const first = result.content?.[0];
  const text = first?.text;

  return parseJsonText(text);
};

const getFirstTextFromResource = (resource: { readonly contents: ReadonlyArray<unknown> }): string | undefined => {
  const first = resource.contents[0];

  if (!first || typeof first !== 'object') {
    return undefined;
  }

  const record = first as { readonly text?: unknown };

  return typeof record.text === 'string' ? record.text : undefined;
};

test('should expose tools, resources, and prompts when starting MCP server', async () => {
  // Arrange
  const tmpRootAbs = await mkdtemp(path.join(os.tmpdir(), 'firebat-mcp-smoke-root-'));
  await mkdir(path.join(tmpRootAbs, '.firebat'), { recursive: true });
  await writeFile(
    path.join(tmpRootAbs, 'package.json'),
    JSON.stringify({ name: 'firebat-mcp-smoke-fixture', private: true, devDependencies: { firebat: '0.0.0' } }, null, 2) + '\n',
    'utf8',
  );

  const client = new Client({ name: 'firebat-smoke', version: '0.0.0' });
  const serverEntry = path.resolve(import.meta.dir, '../../../index.ts');
  const transport = new StdioClientTransport({
    command: 'bun',
    args: [serverEntry, 'mcp'],
    cwd: tmpRootAbs,
  });

  // Act
  await client.connect(transport);

  try {
    // Assert
    const tools = await client.listTools();
    const toolNames = new Set(tools.tools.map(t => t.name));

    expect(toolNames.has('scan')).toBe(true);
    expect(toolNames.has('find_pattern')).toBe(true);
    expect(toolNames.has('trace_symbol')).toBe(true);
    expect(toolNames.has('lint')).toBe(true);

    const fixture = path.resolve(import.meta.dir, 'fixtures/sample.ts');
    const scanResult = (await client.callTool({
      name: 'scan',
      arguments: { targets: [fixture], detectors: ['exact-duplicates', 'waste'], minSize: 'auto', maxForwardDepth: 0 },
    })) as ToolResultLike;
    const scanStructured = getStructuredContent(scanResult) as { readonly report?: unknown };

    expect(scanStructured.report).toBeTruthy();

    const findResult = (await client.callTool({
      name: 'find_pattern',
      arguments: {
        targets: [fixture],
        ruleName: 'inline',
        rule: { pattern: 'console.log($$$ARGS)' },
      },
    })) as ToolResultLike;
    const findStructured = getStructuredContent(findResult) as { readonly matches?: unknown };

    expect(Array.isArray(findStructured.matches)).toBe(true);

    const resources = await client.listResources();
    const uris = new Set(resources.resources.map(r => r.uri));

    expect(uris.has('report://last')).toBe(true);

    const lastReport = await client.readResource({ uri: 'report://last' });
    const firstText = getFirstTextFromResource(lastReport);

    expect(firstText).toBeDefined();

    const prompts = await client.listPrompts();
    const promptNames = new Set(prompts.prompts.map(p => p.name));

    expect(promptNames.has('review')).toBe(true);

    const prompt = await client.getPrompt({
      name: 'review',
      arguments: { reportJson: JSON.stringify(scanStructured.report) },
    });

    expect(prompt.messages.length).toBeGreaterThan(0);
  } finally {
    await client.close();

    await rm(tmpRootAbs, { recursive: true, force: true });
  }
});
