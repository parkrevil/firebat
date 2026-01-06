import type { Rule } from '../interfaces';
import type { StyleViolation } from '../types';
import type { SourceFile } from 'ts-morph';
import { parseSync } from 'oxc-parser';
import {
    RULE_ID_REPEATED_LITERALS,
    NODE_TYPE_IMPORT_DECLARATION,
    NODE_TYPE_EXPORT_NAMED_DECLARATION,
    NODE_TYPE_EXPORT_ALL_DECLARATION
} from '../constants';

export const repeatedLiteralsRule: Rule = {
  id: RULE_ID_REPEATED_LITERALS,
  check(file: SourceFile): StyleViolation[] {
    const violations: StyleViolation[] = [];
    const sourceText = file.getFullText();
    const filePath = file.getFilePath();

    // Parse with oxc-parser
    const result = parseSync(filePath, sourceText);

    if (result.errors.length > 0) {
        // Parsing failed, fallback or ignore?
        console.warn(`oxc-parser failed to parse ${filePath}`);
        return [];
    }

    const counts = new Map<string, number>();

    // Helper to traverse
    function traverse(node: any) {
        if (!node || typeof node !== 'object') return;

        // Check for String Literal
        // oxc-parser produces "Literal" for string/number/boolean/null
        // We check if it is a string literal by checking typeof value or if raw starts with quote
        if (node.type === 'Literal' && typeof node.value === 'string') {
             const raw = node.raw;
             if (raw) {
                counts.set(raw, (counts.get(raw) || 0) + 1);
             }
        }
        // Fallback for different oxc versions if needed
        else if (node.type === 'StringLiteral') {
             const raw = sourceText.substring(node.span.start, node.span.end);
             counts.set(raw, (counts.get(raw) || 0) + 1);
        }

        for (const key in node) {
            // Skip location info and parent links if any
            if (key === 'span' || key === 'loc' || key === 'start' || key === 'end') continue;

            // Skip 'source' property in Import/Export declarations (the module path string)
            // ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration have 'source'.
            // But we handle traversal at statement level.
            // However, inside ExportNamedDeclaration, we might traverse into 'declaration'.
            // If we are just recursively traversing, we need to be careful not to traverse 'source' property of parent nodes.
            // But 'traverse' function iterates all keys.
            // We can explicitly skip 'source' key if the parent node is one of those types.
            if (key === 'source' && (node.type === NODE_TYPE_IMPORT_DECLARATION || node.type === NODE_TYPE_EXPORT_NAMED_DECLARATION || node.type === NODE_TYPE_EXPORT_ALL_DECLARATION)) {
                continue;
            }

            const value = node[key];
            if (Array.isArray(value)) {
                for (const item of value) traverse(item);
            } else {
                traverse(value);
            }
        }
    }

    // Better traversal that knows about imports
    function traverseProgram(program: any) {
        for (const stmt of program.body) {
            if (stmt.type === NODE_TYPE_IMPORT_DECLARATION || stmt.type === NODE_TYPE_EXPORT_ALL_DECLARATION) {
               // Skip the source part of imports/exports
               continue;
            }

            if (stmt.type === NODE_TYPE_EXPORT_NAMED_DECLARATION) {
                // If it has a declaration (export const x = ...), traverse the declaration
                if (stmt.declaration) {
                    traverse(stmt.declaration);
                }
                // It might be `export { x } from 'mod'`, which has 'source' and 'specifiers'.
                // 'source' should be skipped (handled by key check in traverse, or explicit here).
                // 'specifiers' are identifiers, not string literals we care about (usually).
                continue;
            }

            traverse(stmt);
        }
    }

    traverseProgram(result.program);

    for (const [text, count] of counts) {
        if (count >= 2) {
             violations.push({
                ruleId: RULE_ID_REPEATED_LITERALS,
                message: `String literal ${text} appears ${count} times. Define a constant or enum.`,
                file: filePath,
            });
        }
    }

    return violations;
  },
};
