# Rule Comparison: Bun-Checker vs Oxlint

This document compares the style rules defined in `STYLEGUIDE.md` with the native capabilities of `oxlint` and the custom implementation in `bun-checker-plugin`.

## Summary

| ID | Rule Name | Oxlint Native | Custom Plugin | Status |
| :--- | :--- | :--- | :--- | :--- |
| STYLE-001 | File Naming (kebab-case) | ❌ No (Exact logic) | ✅ Implemented | Done |
| STYLE-002 | No Single Letter Identifiers | ❌ No | ✅ Implemented | Done |
| STYLE-003 | No Abbreviations | ❌ No (Exact logic) | ✅ Implemented | Done |
| STYLE-004 | No Inline Object Types | ❌ No | ✅ Implemented | Done |
| STYLE-005 | Type/Interface Separation | ❌ No | ✅ Implemented | Done |
| STYLE-006 | No explicit any | ✅ `typescript/no-explicit-any` | - | Native Used |
| STYLE-007 | Explicit Return Type | ❌ No | ✅ Implemented | Done |
| STYLE-009 | Force Curly Block | ❌ No (Exact logic) | ✅ Implemented | Done |
| STYLE-011 | No Local Constants | ❌ No | ✅ Implemented | Done |
| STYLE-012 | Generic Naming | ❌ No | ✅ Implemented | Done |
| STYLE-014 | Shorthand Property | ✅ `object-shorthand` | ✅ Implemented | Custom Preferred |
| STYLE-015 | Max Function Params (4) | ✅ `max-params` | ✅ Implemented | Custom Preferred |
| STYLE-018 | No Bracket Notation | ✅ `dot-notation` | ✅ Implemented | Custom Preferred |
| STYLE-019 | Nullish Coalescing | ❌ No | ✅ Implemented | Done |
| STYLE-021 | Enum Member PascalCase | ❌ No | ✅ Implemented | Done |
| STYLE-022 | Repeated Literals | ❌ No | ✅ Implemented | Done |
| STYLE-023 | Restrict Spread | ❌ No | ✅ Implemented | Done |

## Details

### 1. STYLE-001: File Naming (kebab-case)
- **Plugin:** `file-naming`
- **Logic:** Enforces kebab-case for filenames, ignoring reserved files (`index.ts`, etc.) and `.spec.ts`.

### 2. STYLE-002: No Single Letter Identifiers
- **Plugin:** `no-single-letter`
- **Logic:** Bans 1-char identifiers except `i`, `j`, `k`, `_`, `T`.

### 3. STYLE-003: No Abbreviations
- **Plugin:** `no-abbreviation`
- **Logic:** Flags short identifiers (2-3 chars) not in allowed list (`id`, `req`, `res`, `ctx`, `err`).

### 4. STYLE-004: No Inline Object Types
- **Plugin:** `no-inline-object`
- **Logic:** Bans inline object types in function signatures/variables.

### 5. STYLE-005: Type/Interface Separation
- **Plugin:** `type-interface-separation`
- **Logic:** Enforces types/interfaces to be defined in `types.ts`/`interfaces.ts`.

### 6. STYLE-006: No explicit any
- **Native:** Used `typescript/no-explicit-any`.

### 7. STYLE-007: Explicit Return Type
- **Plugin:** `explicit-return-type`
- **Logic:** Requires return type annotation on function declarations.

### 8. STYLE-009: Force Curly Block
- **Plugin:** `force-curly-block`
- **Logic:** Enforces curly braces for `if`/`else` blocks.

### 9. STYLE-011: No Local Constants
- **Plugin:** `no-local-constants`
- **Logic:** Bans local `const` variables using `SCREAMING_SNAKE_CASE`.

### 10. STYLE-012: Generic Naming
- **Plugin:** `generic-naming`
- **Logic:** Generic parameters must be `T` or PascalCase (e.g. `TInput`).

### 11. STYLE-014: Shorthand Property
- **Plugin:** `shorthand-property`
- **Logic:** Enforces `{ a }` instead of `{ a: a }`.

### 12. STYLE-015: Max Function Params
- **Plugin:** `max-params`
- **Logic:** Limit: 4.

### 13. STYLE-018: No Bracket Notation
- **Plugin:** `no-bracket-notation`
- **Logic:** Enforces dot notation for valid identifiers.

### 14. STYLE-019: Nullish Coalescing
- **Plugin:** `nullish-coalescing`
- **Logic:** Suggests `??` over `||`.

### 15. STYLE-021: Enum Member PascalCase
- **Plugin:** `enum-pascal-case`
- **Logic:** Enforces PascalCase for enum members.

### 16. STYLE-022: Repeated Literals
- **Plugin:** `repeated-literals`
- **Logic:** Flags string literals repeated 2+ times.

### 17. STYLE-023: Restrict Spread
- **Plugin:** `restrict-spread`
- **Logic:** Warns on spread operator usage to encourage explicit copying.

## Conclusion

The `bun-checker-plugin` provides comprehensive coverage of the Style Guide, implementing rules that are either missing from `oxlint` or require specific logic (like file naming exclusions or semantic type separation). Where possible, native rules (`no-explicit-any`) are enabled.
