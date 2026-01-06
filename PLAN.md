# Agentic Code Styler: Development Roadmap & Capabilities

This document outlines the roadmap for building an "Agentic Code Styler" that transcends traditional linters (ESLint) and formatters (Prettier). The goal is to provide **JetBrains-level detailed formatting**, **Semantic Type Refactoring**, and **Logic Proposals (Clean Code)**, utilizing a hybrid stack of **Bun**, **ts-morph (Semantic Analysis)**, and **oxc-parser (Syntax Speed)**.

## 1. Core Philosophy

- **Beyond Linting:** Don't just find errors; understand the *intent* of types and logic.
- **Deep Semantics:** Leverage TypeScript's compiler API to understand type relationships (e.g., "Is this object a subset of that interface?").
- **Opinionated & Educative:** Actively suggest "Better TypeScript" patterns (e.g., `Omit`, `Partial`, `const enum`, Guard Clauses).
- **Agentic Control:** Enforce architectural decisions (Layer boundaries, DTO immutability) that generic tools cannot understand.

## 2. Feature Roadmap & Feasibility

### A. Semantic Type Analysis & Refactoring (High Value)

These features utilize `ts-morph`'s Type Checker to analyze relationships between types.

| Feature | Description | Implementation Strategy | Feasibility |
| :--- | :--- | :--- | :--- |
| **Smart Type Algebra Suggestions** | Detect when a type is a transformation of another.<br>Example: If `InterfaceB` has all props of `InterfaceA` except `id`, suggest `type B = Omit<A, 'id'>`. | Extract properties of all interfaces in scope. Calculate Intersection/Difference set. If similarity > 80%, propose `Pick`/`Omit`/`Partial`. | ✅ High |
| **Strict Immutability Enforcement** | Enforce `readonly` on specific architectural layers (e.g., DTOs, API Responses). | Check file path (e.g., `*.dto.ts`). recursivley check `PropertySignature` modifiers. Fail if `readonly` is missing. | ✅ High |
| **Inline Type Ban & Extraction** | Detect inline object types (`{ a: number }`) in function params/returns and suggest named interfaces. | Traverse AST for `TypeLiteral`. If parent is not `TypeAlias`, extract to `interfaces.ts` (using project conventions) and replace with name. | ✅ High |
| **Enum vs Union Optimization** | Suggest `union type` over `enum` for simple string constants, or `const enum` for performance. | Analyze Enum usage. If used only as values, suggest Union. If used for nominal typing, suggest `const enum`. | ✅ High |
| **Type Narrowing Proposals** | Detect inefficient type checks. Suggest `is` type guards or tagged unions. | Analyze `if` blocks checking properties. If multiple checks exist, suggest a User-Defined Type Guard function. | ⚠️ Medium |

### B. Logic & Control Flow (Clean Code)

These features require analyzing the AST structure and Control Flow (basic level).

| Feature | Description | Implementation Strategy | Feasibility |
| :--- | :--- | :--- | :--- |
| **Early Return / Guard Clauses** | Detect nested `if-else` blocks and suggest inverting control flow. | Calculate nesting depth. If `if (condition) { large_block }` exists at top level, suggest `if (!condition) return;`. | ✅ High |
| **Dead Code / Unreachable Logic** | Detect logic that TS might miss or logic that is practically dead (e.g., constant conditions). | Analyze conditional expressions with constant values using `oxc-parser` or `ts-morph` evaluation. | ✅ High |
| **Loop Optimization Suggestions** | Suggest `for..of` instead of `forEach` (for `await` support) or `map` instead of `push` loop. | Match AST patterns: `arr.forEach(async ...)` -> Suggest `for (const x of arr)`. | ✅ High |
| **Argument Objectification** | If function args > 3 (or 4), suggest converting to a single Object parameter (DTO). | Count parameters. If > Threshold, generate an Interface definition and refactor function signature. | ✅ High |

### C. Strict Formatting & Layout (JetBrains Level)

These features involve enforcing "Visual Logic" and spacing rules that standard formatters ignore.

| Feature | Description | Implementation Strategy | Feasibility |
| :--- | :--- | :--- | :--- |
| **Semantic Line Spacing** | Enforce blank lines between "different kinds" of statements (e.g., Variable Decl vs Logic vs Logging). | AST Traversal. Check `node.getKind()`. If `prevNode` kind != `currNode` kind, enforce `StartLine - PrevEndLine >= 2`. | ✅ High |
| **Log Grouping** | Ensure loggers are grouped and isolated. | Detect `CallExpression` matches `logger.*`. Enforce empty lines before/after the logging *block*. | ✅ High |
| **Import Ordering & Grouping** | Enforce architectural layering in imports (Lib -> Domain -> Infra -> UI). | Parse imports. Sort by layer priority defined in config. Enforce newline between groups. | ✅ High |
| **Comment Constraints** | Ban inline comments for code explanation; allow only TSDoc or "Why" comments. | Regex/AST scan for `//`. Analyze content. If strictly "descriptive" (repeats code), flag it. | ⚠️ Medium |

### D. Architectural Enforcement (Agentic Scope)

| Feature | Description | Implementation Strategy | Feasibility |
| :--- | :--- | :--- | :--- |
| **Layer Boundary Check** | Prevent `Domain` layer importing `Infrastructure` layer. | Check `ImportDeclaration` module specifiers against file path rules. | ✅ High |
| **Filename & Structure Sync** | Ensure filename matches primary export (e.g., `UserComponent` class in `user-component.ts`). | Compare `SourceFile.getBaseName()` with exported Symbol names. | ✅ High |
| **Barrel File Management** | Manage `index.ts` exports automatically. | Scan directory. Ensure all public modules are exported in `index.ts`. Detect circular deps. | ✅ High |

## 3. Technology Stack Choice: Why Hybrid?

To achieve this ambitious feature set without rebuilding a compiler from scratch in Rust:

1.  **oxc-parser (The Speed):**
    *   **Role:** First-pass scanner.
    *   **Usage:** Quickly scan 1000s of files to find "Potential Candidates" (e.g., files with repeated strings, nested ifs). Discard clean files instantly.
    *   **Reason:** Node/Bun startup is fast, but `ts-morph` type checking is slow. `oxc` filters the workload.

2.  **ts-morph / TypeScript Compiler API (The Brain):**
    *   **Role:** Deep analysis & Refactoring.
    *   **Usage:** For files flagged by `oxc`, load into `ts-morph`. Run type algebra checks (Intersection/Omit analysis). Generate refactored code.
    *   **Reason:** Only the TS Compiler knows if `TypeA` is assignable to `TypeB`. No other tool mimics this perfectly.

3.  **Bun (The Runtime):**
    *   **Role:** Execution environment & Test runner.
    *   **Usage:** Fast IO, native semantic versioning, built-in test runner.

## 4. Execution Plan (Next Steps)

1.  **Refine MVP:** Ensure current rules are robust (Done).
2.  **Implement Semantic Rules:** Start with `Partial/Omit` suggester.
3.  **Implement Layout Rules:** Add "Semantic Line Spacing" checker.
4.  **CLI Polish:** Add `--fix` mode where safe (e.g., adding imports, simple renames).
