---
name: use-pnpm-exec-for-node-tools
description: "Always run Node tooling through pnpm (pnpm exec tsc, etc.) — never plain/global binaries"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a2e4aa1b-f691-463f-bd6b-ad85bfadb332
---

Run everything Node-related through pnpm. Use `pnpm exec tsc` (not plain `tsc`, which resolves the global install) and likewise `pnpm exec <tool>` / `pnpm <script>` rather than `node_modules/.bin/<tool>` or global binaries.

**Why:** Plain `tsc` picks up a global TypeScript that can differ from the project's pinned version, giving misleading results. Andrii wants pnpm to own all Node package management and execution (see also global CLAUDE.md package-manager rule).

**How to apply:** Typecheck with `pnpm exec tsc --noEmit`; run any CLI tool as `pnpm exec <tool>`; run scripts as `pnpm <script>`. Never suggest or run `npm`/`yarn`/`bun` or bare global binaries.
