---
name: anti-hallucination
description: Project-specific checklist to verify before generating any sim block or model code
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0211ddfe-0ba5-468a-bfd4-6bcecfe80ae9
---

Run this checklist mentally before producing any sim block or model config code. Each point targets a real failure mode.

## 1. Block name exists in lib?

Before referencing a lib block by name, verify it exists in `src/sim/models/lib/quad/`. Current canonical names:

`fc_acro` · `hw` · `lifecycle` · `mission` · `world` · `wind` · `noise` · `navigator_wp` · `navigator_w1` · `navigator_cturn` · `navigator_rates` · `planner_wp` · `planner_w1a` · `planner_w1b` · `planner_cturn` · `planner_rates`

Do NOT invent names like `validator`, `params`, `fc_stabilizer` for lib blocks — those are old or model-local names.

## 2. No imports in editable block source

The engine compiles user-editable block source via `new Function` after `stripTypes` strips all `import` lines. An edited block will lose any imported value at runtime.

❌
```ts
import { GRAVITY } from '../consts.ts'
function tick(state) { return -GRAVITY * state.mass }
```

✅
```ts
function tick(state) { return -state.K.GRAVITY * state.mass }
```

Shared constants reach blocks via `state.K` (published by the `lifecycle` static block). See [[sim-block-editing-strips-imports]] and [[quad-block-library-consts]].

## 3. Static vs dynamic — know which your block is

Only the `lifecycle` block is `static: true` (runs once, output lives in `inst.staticState`, NOT in `history`). All other blocks are dynamic.

- **Static block** `mapStateOut`: writes fields that become `staticState` (e.g. `K`)
- **Dynamic block** `mapStateIn`: receives `{ ...state, ...staticState }` — so it CAN read `state.K`, but MUST NOT return `K` from `mapStateOut` (that would inject it into the dynamic history)

❌ Dynamic block returning static data:
```ts
mapStateOut: (out) => ({ K: out.K, pos: out.pos })  // K leaks into history
```

✅
```ts
mapStateOut: (out) => ({ pos: out.pos })
```

## 4. mapStateIn reads `state.K`, not bare `K`

❌ `const { KP, KD } = K`  (K is undefined — it's not a closure variable)

✅ `const { KP, KD } = state.K`

## 5. Model config is a factory, not a plain object

Lib-based models export a `createXxxConfig(overrides?: Partial<QuadConsts>)` factory. The registry stores the resolved config, not the factory itself.

❌ `export const quadL4Config: ModelConfig = { ... }`

✅ `export function createQuadL4Config(overrides?: Partial<QuadConsts>): ModelConfig { ... }`

## 6. Bus field names — don't invent

Check existing blocks in `lib/quad/` for established bus field names before coining new ones. Key established fields:

`pos` · `vel` · `att` · `attRate` · `motorCmd` · `thrust` · `phase` · `status` · `statusReturn` · `tick` · `validator` · `K`

Window-specific: `normal` · `width` · `height` (on the step bus, not invented per-block)

## 7. Route lives in model-local `route.ts`

Window/racing model routes (`StepDef[]`) live in the model's own `route.ts`, imported by BOTH the config (→ `makeLifecycleBlock`) and vis (→ window/gate overlay). Never inline a route into the config object.

## 8. Block diagram: static blocks need `analyzeConnections` to see the static slice

If you add a new static block (or change which fields are static), `SimBlocksDiagram.ts` must receive the static slice via `computeStaticSlice(config)` — otherwise edges from that block will silently vanish from the diagram. See [[engine-static-dynamic-state-split]].
