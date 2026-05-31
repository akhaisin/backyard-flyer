// Window-gate mission, restructured to the quad-l4 / quad-pole step+status
// pattern. Mission owns phase sequencing and the step list only. Crossing
// detection (whether the drone passed through the gate, missed the frame, or
// is still approaching) is delegated to planner_window via stepStatus:
//
//   STATUS_RUNNING   → tick++
//   STATUS_COMPLETED → advance stepIdx (or PHASE_RTH if last)
//   STATUS_FAILED    → enter PHASE_MISSED (off-frame plane crossing)
//   STATUS_RESTART   → reset ticksInPhase, stay on current step
//
// PHASE_MISSED retreats to the previous gate center (or HOME for the first
// gate) and re-enters NAVIGATE on the same stepIdx once close enough. This
// recovery is mission-local, identical to RTH/LAND distance checks.
//
// All step types are window steps. `step.preStageDist` is a per-window prop
// used by the w1b pre-stage planner; w1a's planner ignores it. It lives on
// the shared bus so the type is uniform across both models.

type Vec3 = { x: number; y: number; z: number };

export type WindowStep = {
  center: Vec3;
  normal: Vec3;       // unit vector — direction of travel through the gate
  width: number;
  height: number;
  preStageDist?: number;
  timeout?: number;
  label?: string;
};

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  statusWindow: number;
};

// Numeric projection of the active step on the bus.
type StepBus = {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  preStageDist: number;
};

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  step: StepBus;
  target: Vec3;
  dist: number;
  // Active flight segment for the validator. During NAVIGATE this is the line
  // from the previous gate center (HOME for the first) to the current gate.
  segStart: Vec3;
  segEnd: Vec3;
};

export const PHASE_ARMING    = 0;
export const PHASE_TAKEOFF   = 1;
export const PHASE_NAVIGATE  = 2;
export const PHASE_RTH       = 3;
export const PHASE_LAND      = 4;
export const PHASE_DISARMING = 5;
export const PHASE_DONE      = 6;
export const PHASE_MISSED    = 7;

export const STATUS_RUNNING   = 0;
export const STATUS_COMPLETED = 1;
export const STATUS_FAILED    = 2;
export const STATUS_RESTART   = 3;

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 5;
const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0,          z: 0 };

// 4 gates forming a rectangle. Normal points in the direction of intended
// travel through each gate.
export const STEPS: WindowStep[] = [
  { center: { x:  10, y: CRUISE_ALT, z: -10 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W1' },
  { center: { x:  10, y: CRUISE_ALT, z:  10 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W2' },
  { center: { x: -10, y: CRUISE_ALT, z:  10 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W3' },
  { center: { x: -10, y: CRUISE_ALT, z: -10 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W4' },
];

// Exported so vis plugins keep working with the windowGate plugin.
export const WINDOWS = STEPS;

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function stepToBus(step: WindowStep): StepBus {
  return {
    center:       step.center,
    normal:       step.normal,
    width:        step.width,
    height:       step.height,
    preStageDist: step.preStageDist ?? 0,
  };
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  step: WindowStep, target: Vec3, dist: number,
  segStart: Vec3 = target, segEnd: Vec3 = target,
): MissionOut {
  return {
    phase, stepIdx, ticksInPhase, armed,
    step: stepToBus(step),
    target, dist, segStart, segEnd,
  };
}

function recoveryAnchor(stepIdx: number): Vec3 {
  return stepIdx > 0 ? STEPS[stepIdx - 1].center : HOME;
}

// Scaffolding steps published during phases that don't have a real gate.
const HOME_STEP: WindowStep    = { center: HOME,     normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
const LAND_STEP: WindowStep    = { center: LAND_PAD, normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
function recoveryStep(stepIdx: number): WindowStep {
  return {
    center: recoveryAnchor(stepIdx),
    normal: STEPS[stepIdx].normal,
    width:  WINDOW_SIZE,
    height: WINDOW_SIZE,
  };
}

function navigateStep(stepIdx: number, ticks: number, pos: Vec3): MissionOut {
  const step = STEPS[stepIdx];
  return makeOut(
    PHASE_NAVIGATE, stepIdx, ticks, 1,
    step, step.center, dist3(pos, step.center),
    recoveryAnchor(stepIdx), step.center,
  );
}

export function mission(state: MissionIn): MissionOut {
  const phase   = Math.round(state.phase);
  const stepIdx = Math.round(state.stepIdx);
  const ticks   = Math.round(state.ticksInPhase);

  if (phase === PHASE_ARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(PHASE_TAKEOFF, 0, 0, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
    }
    return makeOut(PHASE_ARMING, 0, ticks + 1, 0, HOME_STEP, HOME, 0);
  }

  if (phase === PHASE_TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      return navigateStep(0, 0, state.pos);
    }
    return makeOut(
      PHASE_TAKEOFF, 0, ticks + 1, 1, HOME_STEP, HOME, dist3(state.pos, HOME),
      HOME, STEPS[0].center,
    );
  }

  if (phase === PHASE_NAVIGATE) {
    const step: WindowStep = STEPS[stepIdx];
    const timedOut = step.timeout !== undefined && ticks >= step.timeout;
    const status   = timedOut ? STATUS_FAILED : Math.round(state.statusWindow);

    if (status === STATUS_COMPLETED) {
      const next = stepIdx + 1;
      if (next >= STEPS.length) {
        return makeOut(
          PHASE_RTH, stepIdx, 0, 1,
          HOME_STEP, HOME, dist3(state.pos, HOME),
          step.center, HOME,
        );
      }
      return navigateStep(next, 0, state.pos);
    }

    if (status === STATUS_FAILED) {
      const anchor = recoveryAnchor(stepIdx);
      return makeOut(
        PHASE_MISSED, stepIdx, 0, 1,
        recoveryStep(stepIdx), anchor, dist3(state.pos, anchor),
        step.center, anchor,
      );
    }

    if (status === STATUS_RESTART) {
      return navigateStep(stepIdx, 0, state.pos);
    }

    return navigateStep(stepIdx, ticks + 1, state.pos);
  }

  if (phase === PHASE_MISSED) {
    const anchor = recoveryAnchor(stepIdx);
    const d = dist3(state.pos, anchor);
    if (d < RTH_THRESHOLD) {
      return navigateStep(stepIdx, 0, state.pos);
    }
    return makeOut(
      PHASE_MISSED, stepIdx, ticks + 1, 1,
      recoveryStep(stepIdx), anchor, d,
      STEPS[stepIdx].center, anchor,
    );
  }

  if (phase === PHASE_RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return makeOut(
        PHASE_LAND, 0, 0, 1,
        LAND_STEP, LAND_PAD, dist3(state.pos, LAND_PAD),
        HOME, LAND_PAD,
      );
    }
    return makeOut(
      PHASE_RTH, stepIdx, ticks + 1, 1, HOME_STEP, HOME, d,
      STEPS[STEPS.length - 1].center, HOME,
    );
  }

  if (phase === PHASE_LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return makeOut(PHASE_DISARMING, 0, 0, 0, LAND_STEP, LAND_PAD, d);
    }
    return makeOut(PHASE_LAND, 0, ticks + 1, 1, LAND_STEP, LAND_PAD, d, HOME, LAND_PAD);
  }

  if (phase === PHASE_DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(PHASE_DONE, 0, 0, 0, LAND_STEP, LAND_PAD, 0);
    }
    return makeOut(PHASE_DISARMING, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0);
  }

  // PHASE_DONE — restart
  if (ticks >= 20) {
    return makeOut(PHASE_ARMING, 0, 0, 0, HOME_STEP, HOME, 0);
  }
  return makeOut(PHASE_DONE, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0);
}
