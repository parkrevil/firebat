import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { RULE_ID_MAX_PARAMS } from '../constants';

export const maxParamsRule: Rule = {
  id: RULE_ID_MAX_PARAMS,
  check(file: SourceFile): StyleViolation[] {
    const violations: StyleViolation[] = [];

    const functions = [
        ...file.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
        ...file.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
        ...file.getDescendantsOfKind(SyntaxKind.ArrowFunction),
        ...file.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ];

    for (const func of functions) {
        const params = func.getParameters();
        if (params.length > 4) {
             violations.push({
                ruleId: RULE_ID_MAX_PARAMS,
                message: `Function has ${params.length} parameters. Maximum allowed is 4.`,
                file: file.getFilePath(),
                line: func.getStartLineNumber(),
            });
        }
    }

    return violations;
  },
};
