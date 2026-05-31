// Window-gate mission with per-step pre-stage offset (w1b variant).
//
// Structure identical to quad-w1a/mission.ts: phase machine + step list +
// dispatch on planner_window.stepStatus. The only difference is that each
// WindowStep here carries a `preStageDist` value — the distance (in metres,
// measured back along the gate normal) at which the pre-stage waypoint
// should sit. planner_window reads this value and uses it to construct the
// approach point. w1a's planner ignores the same field, so the bus shape is
// uniform across both models.

type Vec3 = { x: number; y: number; z: number };

export type WindowStep = {
  center: Vec3;
  normal: Vec3;
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
const PRE_STAGE   = 5.0;       // metres ahead of each gate along its inverse normal
const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0,          z: 0 };

export const STEPS: WindowStep[] = [
  { center: { x:  10, y: CRUISE_ALT, z: -10 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE, label: 'W1' },
  { center: { x:  10, y: CRUISE_ALT, z:  10 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE, label: 'W2' },
  { center: { x: -10, y: CRUISE_ALT, z:  10 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE, label: 'W3' },
  { center: { x: -10, y: CRUISE_ALT, z: -10 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE, label: 'W4' },
];

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

const HOME_STEP: WindowStep = { center: HOME,     normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
const LAND_STEP: WindowStep = { center: LAND_PAD, normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
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

  if (ticks >= 20) {
    return makeOut(PHASE_ARMING, 0, 0, 0, HOME_STEP, HOME, 0);
  }
  return makeOut(PHASE_DONE, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0);
}
