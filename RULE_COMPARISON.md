# Rule Comparison: Bun-Checker vs Oxlint

This document compares the style rules defined in `STYLEGUIDE.md` with the native capabilities of `oxlint` and the custom implementation in `bun-checker-plugin`.

## Summary

| ID | Rule Name | Oxlint Native | Custom Plugin | Status |
| :--- | :--- | :--- | :--- | :--- |
| STYLE-001 | File Naming (kebab-case) | ❌ No | ✅ Implemented | Done |
| STYLE-002 | No Single Letter Identifiers | ❌ No | ✅ Implemented | Done |
| STYLE-004 | No Inline Object Types | ❌ No | ✅ Implemented | Done |
| STYLE-005 | Type/Interface Separation | ❌ No | ✅ Implemented | Done |
| STYLE-007 | Explicit Return Type | ✅ `explicit-function-return-type` | ✅ Implemented | Done |
| STYLE-011 | No Local Constants | ❌ No | ✅ Implemented | Done |
| STYLE-014 | Shorthand Property | ✅ `object-shorthand` | ✅ Implemented | Done |
| STYLE-015 | Max Function Params (4) | ✅ `max-params` | ✅ Implemented | Done |
| STYLE-018 | No Bracket Notation | ✅ `dot-notation` | ✅ Implemented | Done |
| STYLE-019 | Nullish Coalescing | ❌ No | ✅ Implemented | Done |
| STYLE-021 | Enum Member PascalCase | ❌ No | ✅ Implemented | Done |
| STYLE-022 | Repeated Literals | ❌ No | ✅ Implemented | Done |

## Details

### 1. STYLE-001: File Naming (kebab-case)
- **Plugin:** Implemented `file-naming` rule.

### 2. STYLE-002: No Single Letter Identifiers
- **Plugin:** Implemented `no-single-letter` rule.
- **Logic:** Bans 1-char identifiers except `i`, `j`, `k`, `_`, `T`.

### 3. STYLE-004: No Inline Object Types
- **Plugin:** Implemented `no-inline-object` rule.

### 4. STYLE-005: Type/Interface Separation
- **Plugin:** Implemented `type-interface-separation` rule (Semantic).

### 5. STYLE-007: Explicit Return Type
- **Plugin:** Implemented `explicit-return-type` rule.
- **Logic:** Checks for missing return type annotation on function declarations.

### 6. STYLE-011: No Local Constants
- **Plugin:** Implemented `no-local-constants` rule.
- **Logic:** Flags local `const` variables with `SCREAMING_SNAKE_CASE`.

### 7. STYLE-014: Shorthand Property
- **Plugin:** Implemented `shorthand-property` rule.

### 8. STYLE-015: Max Function Params
- **Plugin:** Implemented `max-params` rule.

### 9. STYLE-018: No Bracket Notation
- **Plugin:** Implemented `no-bracket-notation` rule.

### 10. STYLE-019: Nullish Coalescing
- **Plugin:** Implemented `nullish-coalescing` rule.
- **Logic:** Suggests `??` over `||`.

### 11. STYLE-021: Enum Member PascalCase
- **Plugin:** Implemented `enum-pascal-case` rule.

### 12. STYLE-022: Repeated Literals
- **Plugin:** Implemented `repeated-literals` rule.

## Conclusion

The `bun-checker-plugin` implements strict rules corresponding to the Style Guide. While some rules overlap with ESLint/Oxlint standard rules, implementing them as a custom plugin ensures strict adherence to the specific project style guide without relying on external configurations.
