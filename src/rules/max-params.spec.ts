import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { maxParamsRule } from './max-params';
import { TEST_FILENAME } from '../constants';

describe('STYLE-015 Max Params', () => {
  const project = new Project({ useInMemoryFileSystem: true });

  it('should pass for 4 params', () => {
    const code = `function foo(a, b, c, d) {}`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = maxParamsRule.check(file);
    expect(violations).toHaveLength(0);
  });

  it('should fail for 5 params', () => {
    const code = `function foo(a, b, c, d, e) {}`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = maxParamsRule.check(file);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('Maximum allowed is 4');
  });
});
