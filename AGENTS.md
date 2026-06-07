# backyard-flyer

Educational app for learning quadcopter control fundamentals through interactive articles and a live coding sandbox where students read, run, and modify the actual control software.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro 6 |
| Build tool | Vite (via Astro) |
| Package manager | pnpm |
| UI components | React 19 + TypeScript 6 (`client:only` islands) |
| Content | MDX via `@astrojs/mdx`; hash-based SPA routing |
| 3D rendering | Three.js 0.184 |
| Layout panels | react-resizable-panels 4 — sizes must be strings (`"20%"`) |
| Timeseries charts | uPlot 1.6 |
| Testing | Vitest 4 + jsdom |

## Commands

```bash
pnpm dev              # dev server → http://localhost:4322
pnpm build            # type-check + production build
pnpm test             # fast unit tests (engine, hooks, lib) < 1s
pnpm test:sim         # sim model tests (quad-l4/noise/w1a/w1b) ~3s
pnpm test:all         # full suite
pnpm lint             # tsc --noEmit
```

## Testing Strategy

Run `pnpm test` after every change. Run `pnpm test:sim` only when these paths change:

- `src/sim/models/lib/quad/` — shared block library
- `src/sim/models/quad/*/` — model configs or test files
- `src/sim/engine/` — engine

Skip `pnpm test:sim` for UI, MDX, routing, or style changes.

## Architecture

Single-page Astro app with hash-based routing. All MDX pages are server-rendered into a hidden `#page-store`; `PageShell.tsx` moves DOM nodes on navigation without remounting React islands.

The sim engine runs a block-based tick loop: each block declares `mapStateIn` / `fn` / `mapStateOut` and operates on a shared `ModelState` bus. One engine instance per `simId`. Blocks are user-editable — the Source tab compiles and stages TypeScript (import lines stripped) without a page reload.

Shared quad block library lives in `src/sim/models/lib/quad/`. Lib-based models are factory functions `createXxxConfig(overrides?)`. The `lifecycle` block is the only `static: true` block — it runs once and publishes frozen `state.K` (tunable constants) into the engine's static slice, available to all other blocks each tick.

UI layer: Three.js for 3D vis (`SimVis`), uPlot for charts (`SimCharts`), tabbed code editor (`SimSource`).

## Model Inventory

All paths are under `src/sim/models/`.

| Model | Path | Shared lib? |
|---|---|---|
| quad-l4 | `quad/quad-l4` | ✓ |
| quad-noise | `quad/quad-noise` | ✓ |
| quad-w1a | `quad/quad-w1a` | ✓ |
| quad-w1b | `quad/quad-w1b` | ✓ |
| quad-w1-combined | `quad/quad-w1-combined` | ✓ own `lifecycle.ts` |
| quad-c1a | `quad/quad-c1a` | ✓ (target_c1 + planner_c1a) |
| quad-c1b | `quad/quad-c1b` | ✓ (target_c1 + planner_c1b) |
| quad-c2a | `quad/quad-c2a` | ✓ (planner_c2a; target is a real vehicle under `state.vehicles.target`) |
| quad-pole | `racing/quad-pole` | — own blocks |
| quad-ladder | `racing/quad-ladder` | — own blocks |
| quad-rates | `racing/quad-rates` | — own blocks |
| floater | `quad/floater` | — own blocks (legacy) |
| floater-pid | `quad/floater-pid` | — own blocks (legacy) |
| quad-l1 | `quad/quad-l1` | — own blocks (legacy) |
| quad-l2 | `quad/quad-l2` | — own blocks (legacy) |
| quad-l3 | `quad/quad-l3` | — own blocks (legacy) |

## Key Conventions

- **Package manager**: always `pnpm`; always `pnpm exec tsc`, never bare global binaries
- **Model configs**: factory functions `createXxxConfig(overrides?: Partial<QuadConsts>)`, not plain objects
- **Block source**: cannot use `import` — lines are stripped at compile time; shared constants arrive via `state.K`
- **Static vs dynamic**: only `lifecycle` is `static: true`; all other blocks are dynamic
- **Routes**: `StepDef[]` lives in model-local `route.ts`, imported by both config and vis
- **Bus fields**: match existing block names before coining new `ModelState` field names

## Memory Banks

Warm and cold tier knowledge is indexed at [`.claude/memory/MEMORY.md`](.claude/memory/MEMORY.md).
Load the index and relevant files before working on sim, engine, or model code.

@.claude/memory/MEMORY.md
