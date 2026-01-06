import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { noInlineObjectRule } from './no-inline-object';
import { TEST_FILENAME } from '../constants';

describe('STYLE-004 No Inline Object', () => {
  const project = new Project({ useInMemoryFileSystem: true });

  it('should fail for inline object in function param', () => {
    const code = `function foo(a: { x: number }) {}`;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = noInlineObjectRule.check(file);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('Inline object type detected');
  });

  it('should pass for named type', () => {
    const code = `
        type Point = { x: number; y: number };
        function foo(a: Point) {}
    `;
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    // Note: defining type Point = { ... } inside implementation file is STYLE-005 violation,
    // but here we check STYLE-004 (Inline Object).
    // The TypeLiteral in `type Point = { ... }` is allowed by STYLE-004 logic (it is parented by TypeAliasDeclaration).

    const violations = noInlineObjectRule.check(file);
    expect(violations).toHaveLength(0);
  });

  it('should fail for nested inline object in interface', () => {
    const code = `
        interface User {
            info: { name: string };
        }
    `;
    // { name: string } is TypeLiteral. Parent is PropertySignature.
    const file = project.createSourceFile(TEST_FILENAME, code, { overwrite: true });
    const violations = noInlineObjectRule.check(file);
    expect(violations).toHaveLength(1);
  });
});
