import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { isPascalCase } from '../utils/text';
import { RULE_ID_ENUM_PASCAL_CASE } from '../constants';

export const enumPascalCaseRule: Rule = {
  id: RULE_ID_ENUM_PASCAL_CASE,
  check(file: SourceFile): StyleViolation[] {
    const violations: StyleViolation[] = [];

    const enums = file.getDescendantsOfKind(SyntaxKind.EnumDeclaration);

    for (const enumDecl of enums) {
        for (const member of enumDecl.getMembers()) {
            const name = member.getName();
            if (!isPascalCase(name)) {
                violations.push({
                    ruleId: RULE_ID_ENUM_PASCAL_CASE,
                    message: `Enum member '${name}' is not PascalCase.`,
                    file: file.getFilePath(),
                    line: member.getStartLineNumber(),
                });
            }
        }
    }

    return violations;
  },
};
