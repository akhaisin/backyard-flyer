---
name: sim-block-editing-strips-imports
description: "Sim blocks are recompiled from edited source with imports stripped — shared values must arrive as data, not imports"
metadata: 
  node_type: memory
  type: project
  originSessionId: a2e4aa1b-f691-463f-bd6b-ad85bfadb332
---

In the sim engine, blocks are user-editable: the source editor recompiles a block's text via `new Function` after `stripTypes` ([src/sim/engine/stripTypes.ts](src/sim/engine/stripTypes.ts)), which **removes all `import` lines**. So an edited block cannot rely on any imported runtime value (consts, helpers) — only on what arrives through `mapStateIn` and what's defined inline in the block source.

**Why:** This is the core constraint behind the shared-consts design. It rules out "import shared consts from lib" for blocks; consts must be delivered as data.

**How to apply:** Shared constants reach blocks via the `lifecycle` static block that publishes a frozen bag to `state.K`; each consuming block adds `K: s.K` to its `mapStateIn` and reads `state.K.*`. Canonical defaults + factory live in [src/sim/models/lib/quad/consts.ts](src/sim/models/lib/quad/consts.ts) and [lifecycle.ts](src/sim/models/lib/quad/lifecycle.ts). See [[quad-block-library-consts]].

❌ Importing a constant — the import is stripped, `GRAVITY` is undefined at runtime:
```ts
import { GRAVITY } from '../consts.ts'
function tick(state) { return -GRAVITY * state.mass }
```

✅ Reading the constant from the K bag delivered via `mapStateIn`:
```ts
function tick(state) { return -state.K.GRAVITY * state.mass }
```
