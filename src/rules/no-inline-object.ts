import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { RULE_ID_NO_INLINE_OBJECT } from '../constants';

export const noInlineObjectRule: Rule = {
  id: RULE_ID_NO_INLINE_OBJECT,
  check(file: SourceFile): StyleViolation[] {
    const violations: StyleViolation[] = [];

    // Find all TypeLiteral nodes: { a: number }
    const typeLiterals = file.getDescendantsOfKind(SyntaxKind.TypeLiteral);

    for (const typeLiteral of typeLiterals) {
        // Check parent
        const parent = typeLiteral.getParent();

        // Allowed if it is the direct definition of a type alias in types.ts (but STYLE-005 handles separation)
        // If we are in types.ts, type X = { ... } is allowed.
        // If we are in implementation file, TypeAlias is banned by STYLE-005 anyway.
        // So we mainly check if TypeLiteral appears in Function params, Variables, etc.

        // If parent is TypeAliasDeclaration, it is allowed (structurally).
        // Whether TypeAlias is allowed in this file is checked by STYLE-005.
        if (parent.getKind() === SyntaxKind.TypeAliasDeclaration) {
            continue;
        }

        // Allowed if inside an InterfaceDeclaration?
        // Interface body uses PropertySignature, usually not TypeLiteral unless nested.
        // interface A { b: { c: number } } -> { c: number } is TypeLiteral. Nested inline object is also discouraged?
        // STYLE-004 says "Inline Object Types ABSOLUTELY BANNED (including anonymous types)".
        // So even nested ones should be defined as separate types.

        violations.push({
            ruleId: RULE_ID_NO_INLINE_OBJECT,
            message: `Inline object type detected. Define a named type/interface instead.`,
            file: file.getFilePath(),
            line: typeLiteral.getStartLineNumber(),
        });
    }

    return violations;
  },
};
