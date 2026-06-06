---
name: quad-block-library-consts
description: "Shared quad block library + tunable-consts design (params block, frozen state.K, createConfig factory)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a2e4aa1b-f691-463f-bd6b-ad85bfadb332
---

Refactoring (started 2026-05-31, quad-l4 as playground) to dedupe quad blocks and centralize tunable constants:

- **Shared blocks** live in [src/sim/models/lib/quad/](src/sim/models/lib/quad/) and are imported by each model's config (`defaultFn` + `?raw` `defaultCode`).
- **Params bag** typed `QuadConsts` (flat scalars) with canonical `QUAD_DEFAULTS` in `consts.ts` (must be a `type` alias, not `interface`, so it carries an implicit index signature assignable to `ModelState`). The **mission route also lives in the bag** (Andrii's choice: route into the K bag, not a separate steps source) — `QuadParams = QuadConsts & { steps: StepDef[] }`, route supplied per-model by the config and read via `state.K.steps`. Protocol enums (PHASE_*, STATUS_*) stay in-block — contract, not knobs.
- **Delivery:** the `params` block (`makeParamsBlock(QUAD_DEFAULTS, route, overrides)` in `params.ts`) is now a **static block** (`static: true, staticKeys: ['K']`) — runs once into the engine static slice, not per tick. Consumers still add `K: s.K` to `mapStateIn` and read `state.K.*` (engine merges the static slice into each block's input). Editing `params` in the UI retunes the whole stack and reshapes the route. Dictated by [[sim-block-editing-strips-imports]]. See [[engine-static-dynamic-state-split]] for the engine mechanism.
- **Per-instance:** configs become factories — `createQuadL4Config(overrides?: Partial<QuadConsts>)`. `registry.ts` `ModelEntry = ModelConfig | factory`; `resolveSimContext(simId, modelId, overrides?)` calls the factory and returns the engine-stored config for stable identity.

**Status:** quad-l4 FULLY converted — all 7 blocks (fc_acro, navigator_wp, planner_wp, mission, hw, world, validator) extracted to `lib/quad/` and read `state.K`; old `quad-l4/blocks/*` git-rm'd (dir now empty); params block + factory wired; route in bag. tsc/test/build green; NOT yet smoke-tested in the running app. **Remaining:** roll the lib out to other quad models (quad-noise, quad-w1a/b, quad-w1-combined, racing/quad-pole, quad-ladder) — those still have their own block copies.

**Why:** Andrii wanted a block library that retains per-instance, UI-editable, block-immutable consts.
