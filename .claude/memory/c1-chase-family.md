---
name: c1-chase-family
description: "How c1 chase models (quad-c1a, quad-c1b) are structured — kinematic ghost target, direct/pre-staged pursuit planners, mission one-intercept trick"
metadata:
  node_type: memory
  type: project
  originSessionId: 25cfcf10-fcb5-4bf5-aedd-b77412b477fc
---

Models `quad-c1a` and `quad-c1b` implement a **moving-target intercept** scenario. Shipped 2026-06-06/07.

## target_c1 — kinematic ghost

`src/sim/models/lib/quad/target_c1.ts`

Loops all `K.steps` **independently of mission `stepIdx`** — it has its own `activeStepIdx` counter on the state bus.

- Outside NAVIGATE phase (`missionPhase != 2`): reset to `steps[0].pos`, phase=IDLE, `activeStepIdx=-1`
- phase=IDLE → spawn at `steps[0].pos`, phase=MOVING, `activeStepIdx=0`
- phase=TARGET_LAPPED (2): hold at last pos
- Else: advance `speed × DT` toward `steps[activeStepIdx].dest`; on arrival, increment or flip to LAPPED

State bus fields: `target_c1.pos`, `target_c1.phase`, `target_c1.activeStepIdx`

## Mission one-intercept trick

`quad-c1a.config.ts` mission `mapStateIn` restricts K.steps to a single element:
```
K: { ...K, steps: [K.steps[0]] }
```
So `STATUS_COMPLETED → next=1 >= steps.length=1 → STATUS_COMPLETED_ALL → RTH`. One intercept = one round complete. `target_c1` resets when mission restarts (it reads `missionPhase`).

## planner_c1a — direct pursuit

`src/sim/models/lib/quad/planner_c1a.ts`

- Not navigating: face step anchor (`step.pos`), `preGateDone=0`, `STATUS_RUNNING`
- Navigating: `carrot = targetPos` (direct pursuit); yaw = `Math.atan2(-dz, dx)` toward target
- `dist < threshold` → `STATUS_COMPLETED`; `targetPhase == TARGET_LAPPED` → `STATUS_RESTART`

Yaw computed before all status branches so it updates even during RESTART/COMPLETED.

## planner_c1b — pre-stage then direct pursuit

`src/sim/models/lib/quad/planner_c1b.ts`

Adds a pre-stage leg before pursuit:
1. Compute `preStagePos = step.pos + preStageDist * normalize(step.dest − step.pos)`
2. If `dist(pos, preStagePos) <= PREGATE_THRESHOLD (2.0)`: latch `preGateDone=1`
3. While not latched: `carrot = preStagePos`, yaw toward it, `STATUS_RUNNING`
4. After latch: identical to planner_c1a (direct pursuit, same status logic)

`preStageDist=0` degrades exactly to c1a. `preGateDone` is a float on the bus (rounded with `Math.round`).

## C1aStep type

`consts.ts`: `STEP_TYPE_C1A = 5`
```typescript
type C1aStep = {
  type: typeof STEP_TYPE_C1A;
  pos: Vec3;    // target spawn / anchor; also defines pre-stage direction with dest
  dest: Vec3;   // target's destination for this leg (pre-stage axis reference)
  speed: number;
  threshold: number;
  preStageDist?: number;  // c1b: metres along pos→dest before direct pursuit
  timeout?: number;
};
```
`mission.ts` `stepToBus` C1A case passes `pos`, `dest`, `speed`, `threshold`, `preStageDist`.

## Vis notes

- c1a: `movingTarget(s => target_c1, s => pos, { drawGuide: guidesRef })` — guide line from quad to target
- c1b: same but `getGuideTarget: s => planner_c1b.carrot` — guide goes to pre-stage pt while staging, then to target; cyan indicator dot at guide end
- Both have `trail` (toggleable), `windSock`, wind plot row in infoOverlay, `labelMinWidth: 44` on stacked Trail/Guides toggles

## Key consts (both models)

`KI_POS:0.3, MAX_TILT:0.4, KP_YAW_OUTER:5.0, YAW_MEAS_LPF:0.35, ACC_ERR_LIMIT:999999, MAX_RESTARTS:15, REQUIRED_LAPS:2, MAX_TICKS:6000, simDuration:8000`

Wind enabled (default ~20% / 4 N). `WIND_FORCE_MAX_PCT` override removed.

## Known limitation / next algo

`KD_POS` braking causes the quad to slow down as it approaches the target (error→0 = pure braking). Const tuning was tried (`KD_POS: 0.4 / 0.7`) and reverted — it requires a new **lead-pursuit** planner (`carrot = targetPos + LEAD_DIST * normalize(targetVel)`) tentatively called c1c.

See also [[window-model-rebuild-pattern]] (pre-stage pattern from w1b), [[quad-block-library-consts]].
