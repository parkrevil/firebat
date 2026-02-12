import * as path from 'node:path';

import type { NodeRecord, NodeValue, ParsedFile } from '../../engine/types';
import type { DependencyAnalysis, DependencyEdgeCutHint, DependencyFanStat } from '../../types';

import { getNodeName, isNodeRecord, isOxcNode } from '../../engine/oxc-ast-utils';
import { sortDependencyFanStats } from '../../engine/sort-utils';

const createEmptyDependencies = (): DependencyAnalysis => ({
  cycles: [],
  adjacency: {},
  exportStats: {},
  fanInTop: [],
  fanOutTop: [],
  edgeCutHints: [],
});

const normalizePath = (value: string): string => value.replaceAll('\\', '/');

const toRelativePath = (value: string): string => normalizePath(path.relative(process.cwd(), value));

const isNodeValueArray = (value: NodeValue): value is ReadonlyArray<NodeValue> => Array.isArray(value);

const isStringLiteral = (value: NodeValue): value is NodeRecord => {
  if (!isOxcNode(value)) {
    return false;
  }

  if (!isNodeRecord(value)) {
    return false;
  }

  if (value.type !== 'Literal') {
    return false;
  }

  const literalValue = value.value;

  return typeof literalValue === 'string';
};

const collectImportSources = (node: NodeValue, sources: string[]): void => {
  if (isNodeValueArray(node)) {
    for (const entry of node) {
      collectImportSources(entry, sources);
    }

    return;
  }

  if (!isOxcNode(node)) {
    return;
  }

  if (!isNodeRecord(node)) {
    return;
  }

  if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
    const source = node.source;

    if (isStringLiteral(source) && typeof source.value === 'string') {
      sources.push(source.value);
    }
  }

  for (const value of Object.values(node)) {
    if (value === node || value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      continue;
    }

    collectImportSources(value as NodeValue, sources);
  }
};

const buildFileMap = (files: ReadonlyArray<ParsedFile>): Map<string, ParsedFile> => {
  const map = new Map<string, ParsedFile>();

  for (const file of files) {
    map.set(normalizePath(file.filePath), file);
  }

  return map;
};

const resolveImport = (fromPath: string, specifier: string, fileMap: Map<string, ParsedFile>): string | null => {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);

    if (fileMap.has(normalized)) {
      return normalized;
    }
  }

  return null;
};

const buildAdjacency = (files: ReadonlyArray<ParsedFile>): Map<string, ReadonlyArray<string>> => {
  const fileMap = buildFileMap(files);
  const adjacency = new Map<string, ReadonlyArray<string>>();

  for (const file of files) {
    const normalized = normalizePath(file.filePath);
    const sources: string[] = [];

    collectImportSources(file.program as NodeValue, sources);

    const targets = new Set<string>();

    for (const source of sources) {
      const resolved = resolveImport(normalized, source, fileMap);

      if (resolved !== null && resolved.length > 0) {
        targets.add(resolved);
      }
    }

    adjacency.set(normalized, Array.from(targets).sort());
  }

  return adjacency;
};

const isProgramBody = (value: unknown): value is { readonly body: ReadonlyArray<unknown> } => {
  return !!value && typeof value === 'object' && Array.isArray((value as { body?: unknown }).body);
};

const collectExportStats = (
  file: ParsedFile,
): {
  readonly total: number;
  readonly abstract: number;
} => {
  if (file.errors.length > 0) {
    return { total: 0, abstract: 0 };
  }

  const program = file.program as unknown;

  if (!isProgramBody(program)) {
    return { total: 0, abstract: 0 };
  }

  const declaredInterfaces = new Set<string>();
  const declaredAbstractClasses = new Set<string>();

  for (const stmt of program.body) {
    if (!isOxcNode(stmt) || !isNodeRecord(stmt)) {
      continue;
    }

    if (stmt.type === 'TSInterfaceDeclaration') {
      const name = getNodeName((stmt as unknown as { id?: unknown }).id);

      if (typeof name === 'string' && name.trim().length > 0) {
        declaredInterfaces.add(name);
      }

      continue;
    }

    if (stmt.type === 'ClassDeclaration') {
      const abstractFlag = !!(stmt as unknown as { abstract?: unknown }).abstract;

      if (!abstractFlag) {
        continue;
      }

      const name = getNodeName((stmt as unknown as { id?: unknown }).id);

      if (typeof name === 'string' && name.trim().length > 0) {
        declaredAbstractClasses.add(name);
      }
    }
  }

  let total = 0;
  let abstract = 0;

  const record = (kind: 'interface' | 'abstract-class' | 'other'): void => {
    total += 1;

    if (kind === 'interface' || kind === 'abstract-class') {
      abstract += 1;
    }
  };

  const recordDeclaration = (decl: unknown): void => {
    if (!isOxcNode(decl) || !isNodeRecord(decl)) {
      return;
    }

    if (decl.type === 'TSInterfaceDeclaration') {
      record('interface');
      return;
    }

    if (decl.type === 'ClassDeclaration') {
      const abstractFlag = !!(decl as unknown as { abstract?: unknown }).abstract;
      record(abstractFlag ? 'abstract-class' : 'other');
      return;
    }

    // Types, consts, functions, enums, namespaces, etc.
    record('other');
  };

  for (const stmt of program.body) {
    if (!isOxcNode(stmt) || !isNodeRecord(stmt)) {
      continue;
    }

    if (stmt.type === 'ExportNamedDeclaration') {
      const source = (stmt as unknown as { source?: unknown }).source;

      // Ignore re-exports (cannot attribute abstractness without resolution).
      if (source != null) {
        continue;
      }

      const declaration = (stmt as unknown as { declaration?: unknown }).declaration;

      if (declaration != null) {
        recordDeclaration(declaration);
        continue;
      }

      const specifiers = (stmt as unknown as { specifiers?: unknown }).specifiers;

      if (!Array.isArray(specifiers)) {
        continue;
      }

      for (const spec of specifiers) {
        if (!isOxcNode(spec) || !isNodeRecord(spec)) {
          continue;
        }

        const local = (spec as unknown as { local?: unknown }).local;
        const localName = getNodeName(local as never);

        if (typeof localName !== 'string' || localName.trim().length === 0) {
          record('other');
          continue;
        }

        if (declaredInterfaces.has(localName)) {
          record('interface');
        } else if (declaredAbstractClasses.has(localName)) {
          record('abstract-class');
        } else {
          record('other');
        }
      }

      continue;
    }

    if (stmt.type === 'ExportDefaultDeclaration') {
      const declaration = (stmt as unknown as { declaration?: unknown }).declaration;
      recordDeclaration(declaration);
    }
  }

  return { total, abstract };
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const normalizeCycle = (cycle: ReadonlyArray<string>): string[] => {
  const unique = cycle.length > 1 && cycle[0] === cycle[cycle.length - 1] ? cycle.slice(0, -1) : [...cycle];

  if (unique.length === 0) {
    return [];
  }

  let best = unique;

  for (let index = 1; index < unique.length; index += 1) {
    const rotated = unique.slice(index).concat(unique.slice(0, index));

    if (rotated.join('::') < best.join('::')) {
      best = rotated;
    }
  }

  return best.concat(best[0] ?? '');
};

const recordCyclePath = (cycleKeys: Set<string>, cycles: string[][], path: ReadonlyArray<string>): void => {
  const normalized = normalizeCycle(path);

  if (normalized.length === 0) {
    return;
  }

  const key = normalized.join('->');

  if (cycleKeys.has(key)) {
    return;
  }

  cycleKeys.add(key);
  cycles.push(normalized);
};

interface SccResult {
  readonly components: ReadonlyArray<ReadonlyArray<string>>;
}

const tarjanScc = (graph: Map<string, ReadonlyArray<string>>): SccResult => {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const components: string[][] = [];

  const strongConnect = (node: string): void => {
    indices.set(node, index);
    lowlinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        strongConnect(next);
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, lowlinks.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, indices.get(next) ?? 0));
      }
    }

    if (lowlinks.get(node) === indices.get(node)) {
      const component: string[] = [];
      let current = '';

      do {
        current = stack.pop() ?? '';
        onStack.delete(current);
        component.push(current);
      } while (current !== node && stack.length > 0);

      components.push(component);
    }
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return { components };
};

const johnsonCircuits = (
  scc: ReadonlyArray<string>,
  adjacency: Map<string, ReadonlyArray<string>>,
  maxCircuits: number,
): string[][] => {
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();
  const nodes = [...scc].sort(compareStrings);

  const unblock = (node: string, blocked: Set<string>, blockMap: Map<string, Set<string>>): void => {
    blocked.delete(node);

    const blockedBy = blockMap.get(node);

    if (!blockedBy) {
      return;
    }

    for (const entry of blockedBy) {
      if (blocked.has(entry)) {
        unblock(entry, blocked, blockMap);
      }
    }

    blockedBy.clear();
  };

  for (let index = 0; index < nodes.length && cycles.length < maxCircuits; index += 1) {
    const start = nodes[index] ?? '';
    const allowed = new Set(nodes.slice(index));
    const blocked = new Set<string>();
    const blockMap = new Map<string, Set<string>>();
    const stack: string[] = [];
    const neighbors = (value: string): ReadonlyArray<string> =>
      (adjacency.get(value) ?? []).filter(entry => allowed.has(entry));

    const circuit = (node: string): boolean => {
      if (cycles.length >= maxCircuits) {
        return true;
      }

      let found = false;

      stack.push(node);
      blocked.add(node);

      for (const next of neighbors(node)) {
        if (cycles.length >= maxCircuits) {
          break;
        }

        if (next === start) {
          recordCyclePath(cycleKeys, cycles, stack.concat(start));
          found = true;
        } else if (!blocked.has(next)) {
          if (circuit(next)) {
            found = true;
          }
        }
      }

      if (found) {
        unblock(node, blocked, blockMap);
      } else {
        for (const next of neighbors(node)) {
          const blockedBy = blockMap.get(next) ?? new Set<string>();
          blockedBy.add(node);
          blockMap.set(next, blockedBy);
        }
      }

      stack.pop();
      return found;
    };

    circuit(start);
  }

  return cycles;
};

const detectCycles = (adjacency: Map<string, ReadonlyArray<string>>): ReadonlyArray<ReadonlyArray<string>> => {
  const { components } = tarjanScc(adjacency);
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();

  for (const component of components) {
    if (component.length === 0) {
      continue;
    }

    if (component.length === 1) {
      const node = component[0] ?? '';
      const next = adjacency.get(node) ?? [];

      if (next.includes(node)) {
        recordCyclePath(cycleKeys, cycles, [node, node]);
      }

      continue;
    }

    const circuits = johnsonCircuits(component, adjacency, 100);

    for (const circuit of circuits) {
      recordCyclePath(cycleKeys, cycles, circuit);
    }
  }

  return cycles;
};

const listFanStats = (counts: Map<string, number>, limit: number): ReadonlyArray<DependencyFanStat> => {
  const items = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([module, count]) => ({ module: toRelativePath(module), count }));

  return sortDependencyFanStats(items).slice(0, limit);
};

const buildEdgeCutHints = (
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  outDegree: Map<string, number>,
): ReadonlyArray<DependencyEdgeCutHint> => {
  const seen = new Set<string>();
  const hints: DependencyEdgeCutHint[] = [];

  for (const cycle of cycles) {
    if (cycle.length < 2) {
      continue;
    }

    let bestIndex = 0;
    let bestScore = -1;

    for (let index = 0; index < cycle.length - 1; index += 1) {
      const from = cycle[index] ?? '';
      const score = outDegree.get(from) ?? 0;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const from = cycle[bestIndex] ?? '';
    const to = cycle[bestIndex + 1] ?? '';
    const key = `${from}=>${to}`;

    if (from.length === 0 || to.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    hints.push({
      from: toRelativePath(from),
      to: toRelativePath(to),
      score: bestScore > 0 ? bestScore : 1,
      reason: 'breaks cycle',
    });
  }

  return hints;
};

const analyzeDependencies = (files: ReadonlyArray<ParsedFile>): DependencyAnalysis => {
  const hasInputs = files.length > 0;
  const empty = createEmptyDependencies();

  if (!hasInputs) {
    return empty;
  }

  const adjacency = buildAdjacency(files);
  const adjacencyOut: Record<string, ReadonlyArray<string>> = {};
  const exportStats: Record<string, { readonly total: number; readonly abstract: number }> = {};
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const [from, targets] of adjacency.entries()) {
    adjacencyOut[toRelativePath(from)] = targets.map(toRelativePath);
    outDegree.set(from, targets.length);

    if (!inDegree.has(from)) {
      inDegree.set(from, 0);
    }

    for (const target of targets) {
      const prev = inDegree.get(target) ?? 0;

      inDegree.set(target, prev + 1);
    }
  }

  const cyclePaths = detectCycles(adjacency);
  const cycles = cyclePaths.map(path => ({ path: path.map(toRelativePath) }));
  const fanInTop = listFanStats(inDegree, 10);
  const fanOutTop = listFanStats(outDegree, 10);
  const edgeCutHints = buildEdgeCutHints(cyclePaths, outDegree);

  for (const file of files) {
    const key = toRelativePath(normalizePath(file.filePath));
    exportStats[key] = collectExportStats(file);
  }

  return {
    cycles,
    adjacency: adjacencyOut,
    exportStats,
    fanInTop,
    fanOutTop,
    edgeCutHints,
  };
};

export { analyzeDependencies, createEmptyDependencies };
