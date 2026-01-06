import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { RULE_ID_TYPE_INTERFACE_SEPARATION } from '../constants';

export const typeInterfaceSeparationRule: Rule = {
  id: RULE_ID_TYPE_INTERFACE_SEPARATION,
  check(file: SourceFile): StyleViolation[] {
    const baseName = file.getBaseNameWithoutExtension();
    const isReserved = baseName === 'types' || baseName === 'interfaces' || file.getFilePath().endsWith('.d.ts');

    if (isReserved) {
      return [];
    }

    const violations: StyleViolation[] = [];

    // Check for TypeAliasDeclaration
    const typeAliases = file.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration);
    if (typeAliases.length > 0) {
        for (const typeAlias of typeAliases) {
             violations.push({
                ruleId: RULE_ID_TYPE_INTERFACE_SEPARATION,
                message: `Type alias '${typeAlias.getName()}' should be in types.ts`,
                file: file.getFilePath(),
                line: typeAlias.getStartLineNumber(),
            });
        }
    }

    // Check for InterfaceDeclaration
    const interfaces = file.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration);
    if (interfaces.length > 0) {
        for (const interfaceDecl of interfaces) {
            violations.push({
                ruleId: RULE_ID_TYPE_INTERFACE_SEPARATION,
                message: `Interface '${interfaceDecl.getName()}' should be in interfaces.ts`,
                file: file.getFilePath(),
                line: interfaceDecl.getStartLineNumber(),
            });
        }
    }

    return violations;
  },
};
