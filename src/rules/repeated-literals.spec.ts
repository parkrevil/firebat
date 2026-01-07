import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { repeatedLiteralsRule } from './repeated-literals';
import { TEST_FILENAME } from '../constants';

const FOO_ERROR_MSG = '"foo" appears 2 times';

describe('STYLE-022 Repeated Literals', () => {
  const project = new Project({ useInMemoryFileSystem: true });

  it('should pass for no repeated literals', () => {
    const code = `const a = "foo"; const b = "bar";`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = repeatedLiteralsRule.check(file);
    expect(violations).toHaveLength(0);
  });

  it('should fail for repeated literals', () => {
    const code = `const a = "foo"; const b = "foo";`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = repeatedLiteralsRule.check(file);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain(FOO_ERROR_MSG);
  });

  it('should fail for repeated literals in exported constants', () => {
    const code = `export const a = "foo"; export const b = "foo";`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = repeatedLiteralsRule.check(file);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain(FOO_ERROR_MSG);
  });

  it('should ignore imports', () => {
    const code = `
        import { x } from "module";
        import { y } from "module";
    `;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = repeatedLiteralsRule.check(file);
    expect(violations).toHaveLength(0);
  });
});
