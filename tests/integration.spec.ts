import { describe, expect, it } from 'bun:test';
import { Checker } from '../src/checker';
import path from 'path';
import fs from 'fs';

describe('Integration Test', () => {
  const tempDir = path.join(process.cwd(), 'temp-test-project');

  it('should find violations in a bad project', () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);

    // Create a violation file
    fs.writeFileSync(path.join(tempDir, 'BadName.ts'), 'export const x = 1;');

    // Create another violation: Inline object
    fs.writeFileSync(path.join(tempDir, 'bad-code.ts'), 'function f(a: {x:number}) {}');

    const checker = new Checker();
    checker.addFiles(path.join(tempDir, '**/*.ts'));

    const violations = checker.run();

    expect(violations.length).toBeGreaterThanOrEqual(2);

    const fileNamingViolation = violations.find(v => v.ruleId === 'STYLE-001');
    expect(fileNamingViolation).toBeDefined();

    const inlineObjectViolation = violations.find(v => v.ruleId === 'STYLE-004');
    expect(inlineObjectViolation).toBeDefined();

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });
});
