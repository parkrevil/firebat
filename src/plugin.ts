// src/plugin.ts
import { Project } from 'ts-morph';

// --- Constants (Inlined) ---
const RULE_FILE_NAMING = "file-naming";
const RULE_NO_SINGLE_LETTER = "no-single-letter";
const RULE_NO_INLINE_OBJECT = "no-inline-object";
const RULE_TYPE_INTERFACE_SEPARATION = "type-interface-separation";
const RULE_EXPLICIT_RETURN_TYPE = "explicit-return-type";
const RULE_NO_LOCAL_CONSTANTS = "no-local-constants";
const RULE_SHORTHAND_PROPERTY = "shorthand-property";
const RULE_MAX_PARAMS = "max-params";
const RULE_NO_BRACKET_NOTATION = "no-bracket-notation";
const RULE_NULLISH_COALESCING = "nullish-coalescing";
const RULE_ENUM_PASCAL_CASE = "enum-pascal-case";
const RULE_REPEATED_LITERALS = "repeated-literals";

// --- Utils (Inlined) ---
function isKebabCase(text) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text);
}

function isPascalCase(text) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(text);
}

// --- ts-morph Helper ---
let project;
function getProject() {
    if (!project) {
        project = new Project({
            useInMemoryFileSystem: true,
            skipAddingFilesFromTsConfig: true
        });
    }
    return project;
}

// --- Syntax Rules (Pure Oxlint) ---

const fileNamingRule = {
    create(context) {
        return {
            Program(node) {
                const filename = context.filename;
                const parts = filename.split('/');
                const baseName = parts[parts.length - 1];
                if (['index.ts', 'constants.ts', 'enums.ts', 'interfaces.ts', 'types.ts'].includes(baseName)) return;

                let nameToCheck = baseName;
                if (nameToCheck.endsWith('.spec.ts')) {
                     nameToCheck = nameToCheck.replace(/\.spec\.ts$/, '');
                } else if (nameToCheck.endsWith('.ts')) {
                     nameToCheck = nameToCheck.replace(/\.ts$/, '');
                } else {
                    return;
                }

                if (!isKebabCase(nameToCheck)) {
                     context.report({
                        message: `Filename '${baseName}' is not kebab-case (STYLE-001).`,
                        node,
                    });
                }
            }
        };
    }
};

const noSingleLetterRule = {
    create(context) {
        return {
            Identifier(node) {
                if (node.name.length === 1 && !['i', 'j', 'k', '_', 'T'].includes(node.name)) {
                    // Check parent type to exclude property usage etc.
                    // This is a naive check, oxlint AST traversal context needed for accuracy.
                    // But enforcing on declaration is safer.
                    const parent = node.parent;
                    if (parent && (parent.type === 'VariableDeclarator' || parent.type === 'FunctionDeclaration' || parent.type === 'ArrowFunctionExpression')) {
                         context.report({
                            message: `Identifier '${node.name}' is too short. Single letter identifiers are banned except loop indices/generics (STYLE-002).`,
                            node,
                        });
                    }
                }
            }
        };
    }
};

const noInlineObjectRule = {
    create(context) {
        return {
            TSTypeLiteral(node) {
                 if (node.parent.type === 'TSTypeAliasDeclaration') {
                     return;
                 }
                 context.report({
                    message: "Inline object type detected. Define a named type/interface instead (STYLE-004).",
                    node,
                });
            }
        };
    }
};

const explicitReturnTypeRule = {
    create(context) {
        return {
            FunctionDeclaration(node) {
                // Check if exported
                // oxlint AST ExportNamedDeclaration -> declaration -> FunctionDeclaration
                // If direct parent is Program, it's not exported unless default export?
                // Or ExportNamedDeclaration contains it.
                // Assuming we check all Public functions.
                // Simplified: Check all top-level functions or exported ones if possible.
                // Checking returnType property.
                if (!node.returnType) {
                     context.report({
                        message: `Function '${node.id?.name}' is missing return type annotation (STYLE-007).`,
                        node,
                    });
                }
            },
            // Also MethodDefinition, ArrowFunctionExpression if exported variable?
        };
    }
};

const noLocalConstantsRule = {
    create(context) {
        return {
            VariableDeclaration(node) {
                // If inside a function, and is 'const', and looks like SCREAMING_SNAKE_CASE (heuristic for constant), flag it.
                // Or just banning local 'const' for magic values.
                // STYLE-011: Local constants banned -> use class property or global constant.
                // Heuristic: If it's a primitive const inside a block.
                if (node.kind === 'const' && node.parent.type !== 'Program' && node.parent.type !== 'ExportNamedDeclaration') {
                    // It is local.
                    // Check names.
                    node.declarations.forEach(decl => {
                        if (decl.id.type === 'Identifier' && /^[A-Z][A-Z0-9_]+$/.test(decl.id.name)) {
                             context.report({
                                message: `Local constant '${decl.id.name}' detected. Move to class property or constants.ts (STYLE-011).`,
                                node: decl,
                            });
                        }
                    });
                }
            }
        };
    }
};

const shorthandPropertyRule = {
    create(context) {
        return {
            Property(node) {
                if (!node.shorthand && node.key.type === 'Identifier' && node.value.type === 'Identifier' && node.key.name === node.value.name) {
                     context.report({
                        message: `Use shorthand property for '${node.key.name}' (STYLE-014).`,
                        node,
                    });
                }
            }
        };
    }
};

const maxParamsRule = {
    create(context) {
        return {
            FunctionDeclaration(node) {
                if (node.params.length > 4) {
                     context.report({
                        message: `Function has ${node.params.length} parameters. Maximum allowed is 4 (STYLE-015).`,
                        node,
                    });
                }
            }
        };
    }
};

const noBracketNotationRule = {
    create(context) {
        return {
            MemberExpression(node) {
                if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
                    // Check if property name is valid identifier
                    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(node.property.value)) {
                         context.report({
                            message: `Use dot notation instead of bracket notation for '${node.property.value}' (STYLE-018).`,
                            node,
                        });
                    }
                }
            }
        };
    }
};

const nullishCoalescingRule = {
    create(context) {
        return {
            LogicalExpression(node) {
                if (node.operator === '||') {
                     context.report({
                        message: `Prefer '??' (nullish coalescing) over '||' if strictly checking for null/undefined (STYLE-019).`,
                        node,
                    });
                }
            }
        };
    }
};

const enumPascalCaseRule = {
    create(context) {
        return {
            TSEnumMember(node) {
                const name = node.id.name;
                if (typeof name === 'string' && !isPascalCase(name)) {
                    context.report({
                        message: `Enum member '${name}' is not PascalCase (STYLE-021).`,
                        node,
                    });
                }
            }
        };
    }
};

// --- Semantic/Heavy Rules (Using ts-morph) ---

const typeInterfaceSeparationRule = {
    create(context) {
        return {
            Program(node) {
                const filename = context.filename;
                const sourceText = context.sourceCode.text;
                if (filename.endsWith('types.ts') || filename.endsWith('interfaces.ts') || filename.endsWith('.d.ts')) return;

                const proj = getProject();
                const sourceFile = proj.createSourceFile(filename, sourceText, { overwrite: true });

                const interfaces = sourceFile.getInterfaces();
                for (const iface of interfaces) {
                    context.report({
                        message: `Interface '${iface.getName()}' should be in interfaces.ts (STYLE-005) [Verified by ts-morph].`,
                        node,
                    });
                }

                const types = sourceFile.getTypeAliases();
                for (const typeAlias of types) {
                    context.report({
                        message: `Type alias '${typeAlias.getName()}' should be in types.ts (STYLE-005) [Verified by ts-morph].`,
                        node,
                    });
                }
            }
        };
    }
};

const repeatedLiteralsRule = {
    create(context) {
        let counts = new Map();

        return {
            Program(node) {
                counts.clear();
            },
            Literal(node) {
                if (typeof node.value === 'string') {
                    const parent = node.parent;
                    if (parent) {
                         if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') {
                            return;
                        }
                    }

                    const text = node.raw || `"${node.value}"`;
                    counts.set(text, (counts.get(text) || 0) + 1);
                }
            },
            "Program:exit"(node) {
                for (const [text, count] of counts) {
                    if (count >= 2) {
                         context.report({
                            message: `String literal ${text} appears ${count} times. Define a constant or enum (STYLE-022).`,
                            node,
                        });
                    }
                }
            }
        };
    }
};


// --- The Plugin Export ---

const plugin = {
  meta: {
    name: "bun-checker-plugin",
  },
  rules: {
    [RULE_FILE_NAMING]: fileNamingRule,
    [RULE_NO_SINGLE_LETTER]: noSingleLetterRule,
    [RULE_NO_INLINE_OBJECT]: noInlineObjectRule,
    [RULE_TYPE_INTERFACE_SEPARATION]: typeInterfaceSeparationRule,
    [RULE_EXPLICIT_RETURN_TYPE]: explicitReturnTypeRule,
    [RULE_NO_LOCAL_CONSTANTS]: noLocalConstantsRule,
    [RULE_SHORTHAND_PROPERTY]: shorthandPropertyRule,
    [RULE_MAX_PARAMS]: maxParamsRule,
    [RULE_NO_BRACKET_NOTATION]: noBracketNotationRule,
    [RULE_NULLISH_COALESCING]: nullishCoalescingRule,
    [RULE_ENUM_PASCAL_CASE]: enumPascalCaseRule,
    [RULE_REPEATED_LITERALS]: repeatedLiteralsRule
  },
};

export default plugin;
