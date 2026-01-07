# Rule Comparison: Bun-Checker vs Oxlint

This document compares the style rules defined in `STYLEGUIDE.md` with the native capabilities of `oxlint` and the custom implementation in `bun-checker-plugin`.

## Summary

| ID | Rule Name | Oxlint Native | Custom Plugin | Status |
| :--- | :--- | :--- | :--- | :--- |
| STYLE-001 | File Naming (kebab-case) | ❌ No | ✅ Implemented | Done |
| STYLE-004 | No Inline Object Types | ❌ No | ✅ Implemented | Done |
| STYLE-005 | Type/Interface Separation | ❌ No | ✅ Implemented | Done |
| STYLE-015 | Max Function Params (4) | ✅ `max-params` | ✅ Implemented | Redundant (Can use native) |
| STYLE-021 | Enum Member PascalCase | ❌ No | ✅ Implemented | Done |
| STYLE-022 | Repeated Literals | ❌ No | ✅ Implemented | Done |

## Details

### 1. STYLE-001: File Naming (kebab-case)
- **Oxlint:** Does not enforce file naming conventions natively.
- **Plugin:** Implemented `file-naming` rule.
- **Logic:** Checks if filename matches `kebab-case`. Ignores reserved files (`index.ts`, `constants.ts`, etc.).

### 2. STYLE-004: No Inline Object Types
- **Oxlint:** No native rule to ban inline object types specifically.
- **Plugin:** Implemented `no-inline-object` rule.
- **Logic:** Detects `TSTypeLiteral` (e.g., `{ a: number }`) usage outside of `TypeAliasDeclaration`.

### 3. STYLE-005: Type/Interface Separation
- **Oxlint:** No architectural rule for file content separation.
- **Plugin:** Implemented `type-interface-separation` rule.
- **Logic:** Reports error if `type` or `interface` is declared in files other than `types.ts`, `interfaces.ts`, or `.d.ts`.

### 4. STYLE-015: Max Function Params
- **Oxlint:** Has `eslint/max-params`.
- **Plugin:** Implemented `max-params` rule.
- **Note:** Native rule could be used, but custom rule allows specific "4 parameter" logic without extra config.

### 5. STYLE-021: Enum Member PascalCase
- **Oxlint:** `typescript/naming-convention` is not fully implemented/configurable in oxlint yet.
- **Plugin:** Implemented `enum-pascal-case` rule.
- **Logic:** Checks `TSEnumMember` names.

### 6. STYLE-022: Repeated Literals
- **Oxlint:** No native rule for checking repeated string literals across a file.
- **Plugin:** Implemented `repeated-literals` rule.
- **Logic:** Counts string literal occurrences. Reports if count >= 2. Ignores imports/exports.

## Conclusion

The `bun-checker-plugin` successfully implements strict style rules that are specific to this project's architecture and not covered by standard linters. While `max-params` has an equivalent, the custom implementation ensures zero-config compliance with `STYLEGUIDE.md`.
