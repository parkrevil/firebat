import { describe, expect, it } from 'bun:test';

import { analyzeApiDrift } from '../../../src/features/api-drift';
import { createProgramFromMap } from '../shared/test-kit';

function createHandleValueSource(): string {
  return ['export function handle(value) {', '  return value + 1;', '}'].join('\n');
}

function createHandleVoidSource(): string {
  return ['export function handle(value, flag = false) {', '  if (flag) {', '    return;', '  }', '  return;', '}'].join('\n');
}

function createHandleOptionalSource(): string {
  return ['export function handle(value, flag) {', '  if (flag) {', '    return value;', '  }', '  return value;', '}'].join(
    '\n',
  );
}

describe('integration/api-drift', () => {
  it('should group functions when the same name has different shapes', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', createHandleValueSource());
    sources.set('/virtual/api-drift/two.ts', createHandleVoidSource());

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(1);
    expect(analysis.groups[0]?.outliers.length).toBeGreaterThan(0);

    let outlier = analysis.groups[0]?.outliers[0];

    expect(outlier?.filePath).toBeTruthy();
    expect(outlier?.span).toBeTruthy();
  });

  it('should not report drift when function names are unique', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', `export function alpha() {\n  return 1;\n}`);
    sources.set('/virtual/api-drift/two.ts', `export function beta() {\n  return 2;\n}`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should return no findings when input is empty', () => {
    // Arrange
    let sources = new Map<string, string>();
    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should detect drift when optional parameters differ', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', createHandleVoidSource());
    sources.set('/virtual/api-drift/two.ts', createHandleOptionalSource());

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(1);
    expect(analysis.groups[0]?.outliers.length).toBeGreaterThan(0);
  });

  it('should avoid drift when arrow bodies return a value expression', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', `export const handle = (value) => value + 1;`);
    sources.set('/virtual/api-drift/two.ts', `export const handle = (value) => {\n  return value + 1;\n};`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should avoid drift when arrow bodies return an object literal expression', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', `export const handle = (value) => ({ key: value });`);
    sources.set('/virtual/api-drift/two.ts', `export const handle = (value) => {\n  return { key: value };\n};`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should avoid drift when arrow bodies return a void expression explicitly', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', `export const handle = () => void 0;`);
    sources.set('/virtual/api-drift/two.ts', `export const handle = () => {\n  return void 0;\n};`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should ignore nested function return statements when building return kind', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set(
      '/virtual/api-drift/one.ts',
      [
        'export function handle() {',
        '  const inner = () => {',
        '    return 1;',
        '  };',
        '  void inner;',
        '}',
      ].join('\n'),
    );
    sources.set('/virtual/api-drift/two.ts', `export function handle() {\n  const value = 1;\n  void value;\n}`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(0);
  });

  it('should detect drift when TypeScript optional parameters differ', () => {
    // Arrange
    let sources = new Map<string, string>();

    sources.set('/virtual/api-drift/one.ts', `export function handle(value: number, flag?: boolean) {\n  return value;\n}`);
    sources.set('/virtual/api-drift/two.ts', `export function handle(value: number, flag: boolean) {\n  return value;\n}`);

    // Act
    let program = createProgramFromMap(sources);
    let analysis = analyzeApiDrift(program);

    // Assert
    expect(analysis.groups.length).toBe(1);
    expect(analysis.groups[0]?.outliers.length).toBeGreaterThan(0);
  });
});
