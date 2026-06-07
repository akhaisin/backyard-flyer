---
name: context-map
description: "Indexed file-to-role map for the sim engine, block library, and models — load instead of walking the directory tree"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0211ddfe-0ba5-468a-bfd4-6bcecfe80ae9
---

## App shell

| Role | File |
|---|---|
| SPA entry / hash router | `src/pages/pages.astro` |
| Layout + tab bar + panel host | `src/components/PageShell.tsx` |
| Sim React hook | `src/sim/useSim.ts` |
| Model registration | `src/sim/registry.ts` |
| Resolved sim context factory | `src/sim/useResolvedSimContext.ts` |

## Sim engine

| Role | File |
|---|---|
| Engine core (`initSim`, `doTick`, `startSim`, `stopSim`) | `src/sim/engine/engine.ts` |
| Types (`ModelState`, `BlockConfig`, `ModelConfig`) | `src/sim/engine/types.ts` |
| Multi-export source compiler (`compileSource`) | `src/sim/engine/compile.ts` |
| TS-strip for user-edited block source | `src/sim/engine/stripTypes.ts` |

`ModelState = { [key: string]: number | null | ModelState | number[] | ModelState[] }` — structurally open, but validate field names against existing blocks before inventing new ones.

## Shared quad block library (`src/sim/models/lib/quad/`)

| File | Role |
|---|---|
| `consts.ts` | `QuadConsts` type, `QuadParams` (+ `steps: StepDef[]`), `QUAD_DEFAULTS`, `StepDef`/`StepBus` |
| `lifecycle.ts` | Static `lifecycle` block — publishes frozen `state.K`; `before`/`after`/`afterSim` hooks; `makeLifecycleBlock(defaults, route, overrides?)` |
| `mission.ts` | Phase FSM (PHASE_PREFLIGHT→LAND) — reads `state.K.steps`, outputs `pos`/`status` |
| `fc_acro.ts` | Acro flight controller (attitude → motor mix) |
| `hw.ts` | Hardware sim (motor dynamics, IMU) |
| `world.ts` | Physics integrator |
| `wind.ts` | Wind disturbance |
| `noise.ts` | Sensor noise |
| `navigator_wp.ts` | Waypoint navigator (position → attitude cmd) |
| `navigator_w1.ts` | Window-gate family navigator (shared by w1a + w1b) |
| `navigator_cturn.ts` | Coordinated-turn navigator |
| `navigator_rates.ts` | Rate-mode navigator |
| `planner_wp.ts` | Waypoint planner (reports `STATUS_*` to mission) |
| `planner_w1a.ts` | Window planner — pure-pursuit carrot approach |
| `planner_w1b.ts` | Window planner — pre-stage leg + carrot |
| `planner_cturn.ts` | Coordinated-turn planner |
| `planner_rates.ts` | Rate-mode planner |
| `target_c1.ts` | Kinematic ghost target (c1 chase family) — loops all K.steps independently of mission stepIdx; phases: 0=IDLE 1=MOVING 2=LAPPED |
| `planner_c1a.ts` | Direct-pursuit chase planner — carrot = target_c1.pos; step.pos as carrot outside NAVIGATE; yaw = atan2(-dz, dx) |
| `planner_c1b.ts` | Pre-stage then direct pursuit — flies to `step.pos + preStageDist * normalize(dest−pos)`, latches `preGateDone`, then degrades to c1a logic; `preStageDist=0` = pure c1a |

## Models — on shared lib (no local `blocks/` dir)

| Model | Config | Notes |
|---|---|---|
| `quad-l4` | `quad/quad-l4/quad-l4.config.ts` | Reference lib consumer; factory `createQuadL4Config(overrides?)` |
| `quad-noise` | `quad/quad-noise/quad-noise.config.ts` | Adds wind + noise blocks |
| `quad-w1a` | `quad/quad-w1a/quad-w1a.config.ts` | Window gate A; route in `quad-w1a/route.ts` |
| `quad-w1b` | `quad/quad-w1b/quad-w1b.config.ts` | Window gate B (pre-stage); route in `quad-w1b/route.ts` |
| `quad-w1-combined` | `quad/quad-w1-combined/quad-w1-combined.config.ts` | Dual A-vs-B race; own `lifecycle.ts`; route in `quad-w1-combined/route.ts` |
| `quad-c1a` | `quad/quad-c1a/quad-c1a.config.ts` | Chase model; route in `quad-c1a/route.ts`; C1aStep type (STEP_TYPE_C1A=5); uses target_c1 + planner_c1a + navigator_w1; mission restricted to steps[0] so one intercept = RTH |
| `quad-c1b` | `quad/quad-c1b/quad-c1b.config.ts` | Pre-staged chase; route in `quad-c1b/route.ts`; same as c1a + planner_c1b; preStageDist=5.0, threshold=1.0; guide line points to carrot (pre-stage pt then target) |
| `quad-pole` | `racing/quad-pole/quad-pole.config.ts` | Racing (not yet on lib) |
| `quad-ladder` | `racing/quad-ladder/quad-ladder.config.ts` | Racing (not yet on lib) |
| `quad-rates` | `racing/quad-rates/quad-rates.config.ts` | Racing (not yet on lib) |

## Models — own block copies (pre-library, local `blocks/` dirs)

`quad/floater/`, `quad/floater-pid/`, `quad/quad-l1/`, `quad/quad-l2/`, `quad/quad-l3/`

## UI / visualization

| Role | File |
|---|---|
| 3D Three.js canvas | `src/sim/components/ThreeCanvas.tsx` |
| Block wiring diagram | `src/sim/components/SimBlocksDiagram.ts` |
| Charts (uPlot) | `src/sim/components/SimChartsComponent.tsx` |
| Vis (3D scene) | `src/sim/components/SimVisComponent.tsx` |
| Shared quad vis | `src/sim/models/quad/quad.vis.tsx` |
| Scene plugin contract | `src/sim/vis/scenePlugin.ts` |
