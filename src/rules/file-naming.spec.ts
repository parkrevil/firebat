import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { fileNamingRule } from './file-naming';
import { EMPTY_STRING } from '../constants';

describe('STYLE-001 File Naming', () => {
  const project = new Project({ useInMemoryFileSystem: true });

  it('should pass for kebab-case filenames', () => {
    const file = project.createSourceFile('user-controller.ts', EMPTY_STRING, { overwrite: true });
    const violations = fileNamingRule.check(file);
    expect(violations).toHaveLength(0);
  });

  it('should fail for PascalCase filenames', () => {
    const file = project.createSourceFile('UserController.ts', EMPTY_STRING, { overwrite: true });
    const violations = fileNamingRule.check(file);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('not kebab-case');
  });

  it('should fail for camelCase filenames', () => {
    const file = project.createSourceFile('userController.ts', EMPTY_STRING, { overwrite: true });
    const violations = fileNamingRule.check(file);
    expect(violations).toHaveLength(1);
  });

  it('should pass for reserved filenames', () => {
    const reserved = ['index.ts', 'constants.ts', 'enums.ts', 'interfaces.ts', 'types.ts'];
    for (const name of reserved) {
        const file = project.createSourceFile(name, EMPTY_STRING, { overwrite: true });
        const violations = fileNamingRule.check(file);
        expect(violations).toHaveLength(0);
    }
  });

  it('should handle .spec.ts files', () => {
    const file = project.createSourceFile('user-controller.spec.ts', EMPTY_STRING, { overwrite: true });
    const violations = fileNamingRule.check(file);
    expect(violations).toHaveLength(0);
  });

  it('should fail .spec.ts if base is not kebab-case', () => {
    const file = project.createSourceFile('UserController.spec.ts', EMPTY_STRING, { overwrite: true });
    const violations = fileNamingRule.check(file);
    expect(violations).toHaveLength(1);
  });
});
