---
name: c2-chase-family
description: "How the c2 chase models are structured — first-class target vehicle, dual-vehicle state layout, planner_c2a, navigator_c2, stepValidator timing fix, toggles, and flash banners"
metadata:
  type: project
---

Model `quad-c2a` implements **intercept of a fully simulated target** (first-class vehicle). Shipped 2026-06-07.

## State layout

`state.vehicles.target` and `state.vehicles.interceptor` — each a full `VehicleState` with `pos, vel, attitude, motors, aetr, sensors, mission, planner, planner_wp, fc, validator`. Both vehicles write exclusively to their own sub-tree; `planner_c2a` crosses the boundary by reading `vehicles.target.pos` as a read-only input.

Per-vehicle K bags published by the lifecycle: `state.K.target` and `state.K.interceptor` (full `QuadConsts` + HOME_X/Z/steps). Accessors `targetK(s)` / `interceptorK(s)` in config.

## Block execution order within a tick

For both vehicles: `noise → mission → planner_(c2a|wp) → navigator → fc_acro → hw → world`. **The planner runs AFTER mission in the same tick.** This matters for the stepValidator — see timing bug below.

## navigator_target vs navigator_interceptor

- **`navigator_target`** uses `navigator_wp` (same as L4/Noise) — full angular-rate feedback, `step` input. Switched from `navigator_w1` for flight quality parity with `quad-noise`.
- **`navigator_interceptor`** uses `navigator_c2` (`src/sim/models/lib/quad/navigator_c2.ts`) — dedicated c2-family navigator, currently same outer-P carrot loop as `navigator_w1`. Kept separate as extension point for future pursuit algorithms.

## planner_c2a

`src/sim/models/lib/quad/planner_c2a.ts`

- Outside NAVIGATE: reset carrot to `step.pos`, `preGateDone = 0`
- `preGateDone == 0`: fly to `step.pos`; latch when `dist < PREGATE_THRESHOLD` (2 m)
- `preGateDone == 1`: chase `vehicles.target.pos`
  - `targetPhase >= PHASE_RTH (3)` → **`STATUS_FAILED`** (target escaped — chose FAILED over RESTART because there is no recoverable retry in the same round)
  - `dist < threshold (1.5 m)` → `STATUS_COMPLETED`

## lifecycle stepValidator — timing fix

**The bug**: `planner_c2a` and `planner_wp` run AFTER `mission` in the same tick. On the tick when `mission` transitions `NAVIGATE → RTH` (after reading `STATUS_COMPLETED` from the previous tick), `planner_c2a` runs again with `phase = RTH` and resets `stepStatus` to `STATUS_RUNNING`. The `after()` hook then sees `STATUS_RUNNING`, so no counter increments.

**The fix** (`lifecycle.ts` `stepValidator`): capture `planner.stepStatus` and `planner_wp.stepStatus` in the validator while `phase === NAVIGATE` (end of that tick). Store them as `capturedC2aStatus` / `capturedWpStatus`. On the transition tick (`prevPhase=NAVIGATE, phase=RTH`), use the captured values instead of the now-overwritten live values.

Fields added to `validatorInit`: `capturedC2aStatus: -1`, `capturedWpStatus: -1`.

## Intercept toggle

Module-level ref `interceptEnabled` (exported from config, imported by vis).

- **OFF**: `mission_interceptor.mapStateIn` passes `K = { ...interceptorK(s), ARMING_TICKS: 999999 }` → interceptor stays in ARMING indefinitely. Also sets `forceRTH: 1` if mid-mission (aborts TAKEOFF/NAVIGATE → PHASE_RTH).
- **ON → toggled mid-sim**: interceptor arms immediately; no wait for target's cycle because `holdDone` is only in PHASE_DONE, not ARMING.
- Target is unaffected by this toggle; `mission_target.forceRTH` is gated on `intercept && interceptorPhase >= PHASE_RTH`.

## Wind / Noise toggles

- `windEnabled` ref: `wind.mapStateIn` zeroes `ticksLeft`, `WIND_FORCE_INITIAL_PCT`, `WIND_FORCE_MAX_PCT` when disabled — wind block produces zero at source, windsock goes to zero.
- `noiseEnabled` ref: `noise_target/interceptor.mapStateIn` zeroes `POS_STD, VEL_STD, ATT_STD, ANG_VEL_STD` in K when disabled.

## Flash banners

`flashBanner` plugin (`src/sim/vis/plugins/flashBanner.ts`): HTML `div` at bottom-center of vis container, fades from opacity 1→0 over `fadeTicks` ticks when `getCounter` increments.

- **INTERCEPTED** (red `#ff4444`, 40 ticks): fires on `interceptor.validator.lapsTotal` increment
- **INTERCEPTION FAILED** (orange `#ffaa22`, 40 ticks): fires on `interceptor.validator.restarts` increment

## HUD toggles (bottom-left)

Order: Intercept, Wind, Noise, Trail (interceptor), Guide. `TOGGLE_LABEL_W = 66` (fits "Intercept").
