import { describe, expect, it } from 'bun:test';
import * as path from 'node:path';

import { analyzeDependencies } from '../../../src/features/dependencies';
import { createProgramFromMap } from '../shared/test-kit';

const toCycleKey = (cycle: { readonly path: ReadonlyArray<string> }): string => {
  const normalized =
    cycle.path.length > 1 && cycle.path[0] === cycle.path[cycle.path.length - 1] ? cycle.path.slice(0, -1) : [...cycle.path];

  return normalized
    .map(entry => path.basename(entry))
    .sort()
    .join('|');
};

describe('integration/dependencies', () => {
  it('should detect cycles and fan stats when modules are linked', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `import './b';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `import './c';\nexport const beta = 2;`);
    sources.set('/virtual/deps/c.ts', `import './a';\nexport const gamma = 3;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.cycles.length).toBeGreaterThan(0);
    expect(dependencies.fanInTop.length).toBeGreaterThan(0);
    expect(dependencies.fanOutTop.length).toBeGreaterThan(0);
    expect(dependencies.edgeCutHints.length).toBeGreaterThan(0);
  });

  it('should detect self-loop cycles when a module imports itself', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/self.ts', `import './self';\nexport const value = 1;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let cycleKeys = new Set(dependencies.cycles.map(toCycleKey));

    // Assert
    expect(cycleKeys.has(['self.ts'].join('|'))).toBe(true);
  });

  it('should detect two-node cycles when modules import each other', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `import './b';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `import './a';\nexport const beta = 2;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let cycleKeys = new Set(dependencies.cycles.map(toCycleKey));

    // Assert
    expect(cycleKeys.has(['a.ts', 'b.ts'].sort().join('|'))).toBe(true);
  });

  it('should return empty stats when modules do not import each other', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/solo.ts', `export const solo = 1;`);
    sources.set('/virtual/deps/other.ts', `export const other = 2;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.cycles.length).toBe(0);
    expect(dependencies.fanInTop.length).toBe(0);
    expect(dependencies.fanOutTop.length).toBe(0);
    expect(dependencies.edgeCutHints.length).toBe(0);
  });

  it('should return empty stats when input is empty', () => {
    // Arrange
    let sources = new Map<string, string>();
    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.cycles.length).toBe(0);
    expect(dependencies.fanInTop.length).toBe(0);
    expect(dependencies.fanOutTop.length).toBe(0);
    expect(dependencies.edgeCutHints.length).toBe(0);
  });

  it('should resolve index modules when importing a directory', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/app.ts', `import './lib';\nexport const app = 1;`);
    sources.set('/virtual/deps/lib/index.ts', `export const lib = 2;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let fanOutModules = dependencies.fanOutTop.map(entry => entry.module);

    // Assert
    expect(fanOutModules.length).toBeGreaterThan(0);
  });

  it('should include export-from edges when building the graph', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `export * from './b';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `export { gamma } from './c';\nexport const beta = 2;`);
    sources.set('/virtual/deps/c.ts', `import './a';\nexport const gamma = 3;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let cycleKeys = new Set(dependencies.cycles.map(toCycleKey));

    // Assert
    expect(cycleKeys.has(['a.ts', 'b.ts', 'c.ts'].sort().join('|'))).toBe(true);
  });

  it('should include type-only import edges when building the graph', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `import type { Beta } from './b';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `import './a';\nexport type Beta = { value: number };`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let cycleKeys = new Set(dependencies.cycles.map(toCycleKey));

    // Assert
    expect(cycleKeys.has(['a.ts', 'b.ts'].sort().join('|'))).toBe(true);
  });

  it('should detect all cycles when multiple paths converge', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `import './b';\nimport './d';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `import './c';\nexport const beta = 2;`);
    sources.set('/virtual/deps/c.ts', `import './a';\nexport const gamma = 3;`);
    sources.set('/virtual/deps/d.ts', `import './c';\nexport const delta = 4;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let cycleKeys = new Set(dependencies.cycles.map(toCycleKey));

    // Assert
    expect(cycleKeys.has(['a.ts', 'b.ts', 'c.ts'].sort().join('|'))).toBe(true);
    expect(cycleKeys.has(['a.ts', 'c.ts', 'd.ts'].sort().join('|'))).toBe(true);
  });

  it('should de-duplicate identical cycles when the same circuit is discovered multiple ways', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/a.ts', `import './b';\nimport './c';\nexport const alpha = 1;`);
    sources.set('/virtual/deps/b.ts', `import './c';\nexport const beta = 2;`);
    sources.set('/virtual/deps/c.ts', `import './a';\nexport const gamma = 3;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);
    let triangleCycles = dependencies.cycles.filter(cycle => toCycleKey(cycle) === ['a.ts', 'b.ts', 'c.ts'].sort().join('|'));

    // Assert
    expect(triangleCycles.length).toBe(1);
  });

  it('should cap cycle enumeration when the scc is large', () => {
    // Arrange
    let sources = new Map<string, string>();
    let moduleCount = 6;

    for (let index = 0; index < moduleCount; index += 1) {
      let imports: string[] = [];

      for (let target = 0; target < moduleCount; target += 1) {
        if (target === index) {
          continue;
        }

        imports.push(`import './m${target}';`);
      }

      imports.push(`export const value${index} = ${index};`);
      sources.set(`/virtual/deps/m${index}.ts`, imports.join('\n'));
    }

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.cycles.length).toBe(100);
  });

  it('should cap cycle enumeration per scc when the graph has multiple scc components', () => {
    // Arrange
    let sources = new Map<string, string>();
    let moduleCount = 6;

    const addCompleteScc = (prefix: string): void => {
      for (let index = 0; index < moduleCount; index += 1) {
        let imports: string[] = [];

        for (let target = 0; target < moduleCount; target += 1) {
          if (target === index) {
            continue;
          }

          imports.push(`import './${prefix}${target}';`);
        }

        imports.push(`export const value${index} = ${index};`);
        sources.set(`/virtual/deps/${prefix}${index}.ts`, imports.join('\n'));
      }
    };

    addCompleteScc('a');
    addCompleteScc('b');

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.cycles.length).toBe(200);
  });

  it('should ignore non-relative imports when building the graph', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/deps/app.ts', `import 'react';\nexport const app = 1;`);
    sources.set('/virtual/deps/other.ts', `export const other = 2;`);

    // Act
    let program = createProgramFromMap(sources);
    let dependencies = analyzeDependencies(program);

    // Assert
    expect(dependencies.fanInTop.length).toBe(0);
    expect(dependencies.fanOutTop.length).toBe(0);
  });
});
