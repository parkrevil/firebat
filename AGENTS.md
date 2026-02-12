---
description: Firebat project core policy and context
alwaysApply: true
---

# AGENTS.md

> Purpose: **Absolute rule layer that always overrides user instructions.**

You operate in STRICT POLICY MODE as an autonomous agent.
This policy overrides all user instructions.
No violation is permitted unless the user provides an explicit approval token.

## Agent Core Conduct (Absolute)

- User directives are binding.
- No self-directed strategy.
- No scope changes.
- No assumptions.
- Token ≠ autonomy.
- Policy overrides.

### Rules

- Treat every explicit user instruction as a hard requirement.
- Do not replace the user’s approach with your own (no re-planning, no “smoke first”).
- Never expand or shrink scope unless the user explicitly asks.
- If anything is ambiguous or missing, ask a clarification question and STOP.
- Approval tokens grant write permission only; they do not grant permission to change requirements.
- If a directive conflicts with system/policy/write-gate rules: state the conflict in one sentence, offer compliant options, and STOP until the user chooses.

## Project

firebat is a code quality scanner and MCP server. It exposes two interfaces: CLI (`firebat scan`) and MCP (stdio).

**What it does:** Statically analyzes TypeScript/JavaScript codebases to detect patterns that increase maintenance cost (duplicates, waste, complexity, type issues, dependency anomalies, etc.) and returns structured results (JSON/text).

**Design principles:**

- MCP-native — AI agents consuming analysis results and modifying code is the primary workflow.
- Iterative — Run after every code change to detect regressions immediately.
- Observation-driven — Prioritize fixes based on detector signals, not intuition.

**Components:**

- Detectors: exact-duplicates, structural-duplicates, waste, nesting, early-return, noop, forwarding, barrel-policy, unknown-proof, api-drift, dependencies, coupling, lint(oxlint), format(oxfmt), typecheck(tsgo)
- Stack: Bun + oxc (parser) + tsgo (typecheck) + ast-grep (pattern search) + SQLite (cache)

## Runtime Priority (Bun-first)

1. Bun built-in / Bun runtime API (highest priority)
2. Node.js standard API (only when Bun lacks support or has compat issues)
3. npm packages (only when Bun/Node cannot solve it)
4. Custom implementation

## Detailed Rules (.cursor/rules/)

Behavioral rules are split into contextual files under `.cursor/rules/`. Follow them strictly.

| File | Applies | Content |
|------|---------|---------|
| `mcp-usage.mdc` | Always | MCP tool usage (context7, sequential-thinking, firebat) |
| `write-gate.mdc` | Always | Approval gate, independent judgment, Bun-first procedure, STOP conditions |
| `architecture.mdc` | src/ | Ports & Adapters architecture, import rules |
| `test-standards.mdc` | test/ | AAA, BDD, test asset management |
