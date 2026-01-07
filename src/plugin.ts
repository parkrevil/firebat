// src/plugin.ts
import { Project } from 'ts-morph';

// --- Constants (Inlined) ---
const RULE_FILE_NAMING = "file-naming";
const RULE_NO_INLINE_OBJECT = "no-inline-object";
const RULE_MAX_PARAMS = "max-params";
const RULE_TYPE_INTERFACE_SEPARATION = "type-interface-separation";
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
// We create a single project instance to reuse across files if possible,
// though oxlint might isolate execution contexts.
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

                // Allow reserved files
                if (['index.ts', 'constants.ts', 'enums.ts', 'interfaces.ts', 'types.ts'].includes(baseName)) return;

                let nameToCheck = baseName;
                if (nameToCheck.endsWith('.spec.ts')) {
                     nameToCheck = nameToCheck.replace(/\.spec\.ts$/, '');
                } else if (nameToCheck.endsWith('.ts')) {
                     nameToCheck = nameToCheck.replace(/\.ts$/, '');
                } else {
                    return; // Ignore non-ts files
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

const noInlineObjectRule = {
    create(context) {
        return {
            TSTypeLiteral(node) {
                 // Check if parent is TypeAliasDeclaration
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
                // Feasibility Proof: Using ts-morph to parse the file content.
                // Note: context.sourceCode.text gives the full content.
                const filename = context.filename;
                const sourceText = context.sourceCode.text;

                // If file is safe, skip
                if (filename.endsWith('types.ts') || filename.endsWith('interfaces.ts') || filename.endsWith('.d.ts')) return;

                // Use ts-morph to find violations.
                // This is heavier than oxlint AST but demonstrates capability.
                const proj = getProject();
                // Create a source file in memory
                const sourceFile = proj.createSourceFile(filename, sourceText, { overwrite: true });

                // Check for Interfaces
                const interfaces = sourceFile.getInterfaces();
                for (const iface of interfaces) {
                    // Report on the node corresponding to the interface start.
                    // We need to map ts-morph node back to oxlint node or just report on Program with location.
                    // For MVP/PoC, we report on Program node but with message detailing the violation.
                    context.report({
                        message: `Interface '${iface.getName()}' should be in interfaces.ts (STYLE-005) [Verified by ts-morph].`,
                        node,
                    });
                }

                // Check for Type Aliases
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
    [RULE_NO_INLINE_OBJECT]: noInlineObjectRule,
    [RULE_MAX_PARAMS]: maxParamsRule,
    [RULE_TYPE_INTERFACE_SEPARATION]: typeInterfaceSeparationRule,
    [RULE_ENUM_PASCAL_CASE]: enumPascalCaseRule,
    [RULE_REPEATED_LITERALS]: repeatedLiteralsRule
  },
};

export default plugin;
