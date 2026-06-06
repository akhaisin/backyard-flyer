---
name: quad-on-the-fly-tuning-plan
description: "Planned (not yet built) design for on-the-fly PID tuning where one block mutates another's consts"
metadata: 
  node_type: memory
  type: project
  originSessionId: a2e4aa1b-f691-463f-bd6b-ad85bfadb332
---

Future need: models where a tuner block changes PID coeffs used by other blocks, at runtime. Design agreed but **deliberately not implemented yet** (Andrii: "nothing yet" — avoid speculative code; build when the first auto-tuning model appears).

Key insight: the engine already enforces "only a specific block may write variable X" — a block only affects shared state through its own `mapStateOut` ([engine.ts](src/sim/engine/engine.ts) doTick: mapStateIn → fn → mapStateOut), so the `Object.freeze` on `state.K` is just anti-aliasing, not the real access control.

The actual blocker is **persistence**, not mutability: the `params` block re-emits K fresh every tick from static scalars, so it would clobber any tuned value.

Planned shape (consumers reading `state.K.*` stay UNCHANGED):
- tuner block → `mapStateOut` writes a persistent `state.tuning` slice (only tuner writes it).
- params block → `mapStateIn` reads `state.tuning`; `mapStateOut` merges an **allowlisted** subset over the static scalars, re-freezes → `state.K`. e.g. `K: Object.freeze({ ...scalars, ...pickTunable(s.tuning) })`.
- Narrowing scope: *which variables* = `TUNABLE_KEYS` allowlist at the merge (params silently drops non-tunable keys like MAX_THRUST_N / geometry / safety limits, even if tuner is buggy/user-edited); *which block* = already enforced by wiring.
- Cost: one-tick latency (params runs before tuner), fine for discrete PID. Keep K frozen — tuning yields a new frozen K each tick.

Quick win if revisited: partition `QuadConsts` into static vs tunable (or add `TUNABLE_KEYS`) in [consts.ts](src/sim/models/lib/quad/consts.ts) to make the safe-to-tune surface explicit; optionally add the ~15-line params overlay seam (no behavior change while `state.tuning` undefined). Builds on [[quad-block-library-consts]].
