---
name: improvement-backlog
description: "Agreed improvement ideas across docs, testing, UX, model authoring, engine architecture, and lib block structure — proposed 2026-06-09, none built yet"
metadata:
  type: project
---

# Improvement backlog

Proposed 2026-06-09. ★ = best effort-to-payoff. Top three overall: shared test harness + headless runner, seeded RNG injection, on-the-fly tuning panel.

## 1. Agent readability

- ★ **Bus dictionary generator** — script that dumps, per model, which block reads/writes which `ModelState` field (from `mapStateIn`/`mapStateOut` declarations) into a checked-in markdown file. Makes the "match existing field names" convention verifiable.
- **Registry as single source of truth** — `pnpm docs:models` regenerates the model inventory tables in CLAUDE.md / [[context-map]] from `src/sim/registry.ts` so they can't drift.
- **JSDoc contracts on lib blocks** — header per file in `src/sim/models/lib/quad/`: bus inputs, bus outputs, `K` constants consumed, statuses emitted. Planner↔mission `STATUS_*` protocol currently lives only in memory files.
- **Mermaid wiring diagram export** — `SimBlocksDiagram` already computes wiring for the UI; export the same data as Mermaid into docs.

## 2. Safer iteration

- ★ **Shared sim-test harness** — `lib/quad/testHarness.ts` with `runRoute(config, route, criteria, seed)`. Per-model tests (e.g. quad-w1b.test.ts) currently each re-implement the seeded LCG, vis mock, lifecycle-block swap, and calibrated-criteria assertions. New model test should be ~20 lines.
- ★ **Headless sim runner CLI** — `pnpm sim:run <model> --ticks N --seed S --json` printing the same metrics tests use (completionTick, accErr, restarts). Backend for tuning sessions and benchmark comparisons (e.g. arc-vs-lines).
- **CI workflow** — GitHub Actions: `pnpm lint && pnpm test && pnpm test:sim` (~4s).
- **Compile/strip pipeline tests** — `compile.ts` + `stripTypes.ts` handle user-edited source (riskiest path, no dedicated tests). Cases: imports stripped, type annotations removed, multi-export, syntax-error handling.

## 3. User experience

- ★ **On-the-fly tuning panel** — already designed in [[quad-on-the-fly-tuning-plan]] (`state.tuning` overlay). Biggest pedagogical win: drag `KP_POS`, watch response live.
- **Sim speed control + pause/step** — 0.25×–4× slider and single-tick stepping.
- **Persist user-edited block source** per `simId` in localStorage, with a "modified" badge and reset button — student experiments currently die on reload.
- **Standardized status HUD** — one shared status/metrics overlay; c2 flash banners, w1 restart counter, and racing models currently all report differently.

## 4. Easier model creation

- ★ **Auto-register models** via `import.meta.glob` over `models/*/*/[name].config.ts` — removes the hand-maintained import list in `registry.ts`.
- **Scaffold script** — turn [[adding-new-model]] into `pnpm new:model quad/quad-c3 --base c2a` generating config, route, vis stub, test stub, MDX page.
- **Shared route builders** — e.g. `makeRectCourse({gates, yMin, yMax, type})`; the 10-gate rectangular course is hand-typed in multiple fixtures and routes.
- **Declarative vis composition** — scene-config object (`{route: 'gates', guideLine: 'carrot', target: true}`) handled by shared quad vis so most models skip a custom `*.vis.tsx`.

## 5. Simulator architecture

- ★ **Seeded RNG injected through the engine** — wind/noise call `Math.random` directly; tests monkey-patch globally. Put `rand()` on the block `fn` context with seed in config → reproducible runs by construction, enables "replay this exact failure".
- **Record/replay buffer with scrubbing** — record the state bus each tick; scrub the chart, 3D vis follows. Time-travel debugging for planner edge cases.
- **Engine in a Web Worker** — decouples tick loop from render jank; enables faster-than-realtime runs (shared with headless runner and tuning workflows).
- **First-class block I/O declarations** — `reads`/`writes` lists let the engine validate wiring at init (typo'd bus fields are currently silent `undefined`s); bus dictionary and wiring diagram fall out for free.

## 6. Base model structure (lib blocks)

- ★ **Extract pursuit/carrot primitives from planners** — planner_c1b degrades to c1a logic, planner_c2a repeats pre-stage→latch→chase, w1a/w1b share the carrot pattern. Blocks can't import ([[sim-block-editing-strips-imports]]), so helpers must arrive via an engine-passed helpers object on `fn` or live in planner factory closures.
- **Multi-vehicle support in `makeLifecycleBlock`** — quad-w1-combined and quad-c2a each fork their own `lifecycle.ts` for dual K bags. A `vehicles: {name: overrides}` factory option folds them back in; more multi-vehicle models are coming (c2b PN shipped).
- **Canonical `STATUS_*`/`PHASE_*` contract** — statuses are the planner↔mission↔stepValidator API but are scattered across `consts.ts` and per-planner conventions (c2a added `STATUS_FAILED`). Centralize and document which statuses a planner may emit and what mission does with each.
- **Decide fate of legacy models** — `floater`, `floater-pid`, `quad-l1/l2/l3` carry own block copies: migrate onto lib or mark explicitly frozen (README per dir).
- **Finish migrating racing models onto lib** — `quad-pole/ladder/rates` have own blocks while `navigator_rates`/`planner_rates` already exist in the lib; the half-done state is confusing.
