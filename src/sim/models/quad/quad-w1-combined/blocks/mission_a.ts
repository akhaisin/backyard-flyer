// Window-gate mission for vehicle A (track A, -x/+z quadrant), restructured
// around the step+status pattern (quad-l4 / quad-pole). Identical shape to
// quad-w1a/mission.ts with two differences: STEPS are translated to track A,
// and a `loops` counter increments on DONE → ARMING for the lap-rate chart.

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
  loops: number;
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
  loops: number;
};

const PHASE_ARMING    = 0;
const PHASE_TAKEOFF   = 1;
const PHASE_NAVIGATE  = 2;
const PHASE_RTH       = 3;
const PHASE_LAND      = 4;
const PHASE_DISARMING = 5;
const PHASE_DONE      = 6;
const PHASE_MISSED    = 7;

const STATUS_COMPLETED = 1;
const STATUS_FAILED    = 2;
const STATUS_RESTART   = 3;

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 4;
// Track A centred at (-15, 5, 15) — the -x/+z quadrant.
const X_OFF = -15;
const Z_OFF =  15;
const HOME: Vec3     = { x: X_OFF, y: CRUISE_ALT, z: Z_OFF };
const LAND_PAD: Vec3 = { x: X_OFF, y: 0,          z: Z_OFF };

export const STEPS_A: WindowStep[] = [
  { center: { x:  8 + X_OFF, y: CRUISE_ALT, z: -8 + Z_OFF }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A1' },
  { center: { x:  8 + X_OFF, y: CRUISE_ALT, z:  8 + Z_OFF }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A2' },
  { center: { x: -8 + X_OFF, y: CRUISE_ALT, z:  8 + Z_OFF }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A3' },
  { center: { x: -8 + X_OFF, y: CRUISE_ALT, z: -8 + Z_OFF }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A4' },
];

export const WINDOWS_A = STEPS_A;

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
  step: WindowStep, target: Vec3, dist: number, loops: number,
  segStart: Vec3 = target, segEnd: Vec3 = target,
): MissionOut {
  return {
    phase, stepIdx, ticksInPhase, armed,
    step: stepToBus(step),
    target, dist, segStart, segEnd, loops,
  };
}

function recoveryAnchor(stepIdx: number): Vec3 {
  return stepIdx > 0 ? STEPS_A[stepIdx - 1].center : HOME;
}

const HOME_STEP: WindowStep = { center: HOME,     normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
const LAND_STEP: WindowStep = { center: LAND_PAD, normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE };
function recoveryStep(stepIdx: number): WindowStep {
  return {
    center: recoveryAnchor(stepIdx),
    normal: STEPS_A[stepIdx].normal,
    width:  WINDOW_SIZE,
    height: WINDOW_SIZE,
  };
}

function navigateStep(stepIdx: number, ticks: number, pos: Vec3, loops: number): MissionOut {
  const step = STEPS_A[stepIdx];
  return makeOut(
    PHASE_NAVIGATE, stepIdx, ticks, 1,
    step, step.center, dist3(pos, step.center), loops,
    recoveryAnchor(stepIdx), step.center,
  );
}

export function mission_a(state: MissionIn): MissionOut {
  const phase   = Math.round(state.phase);
  const stepIdx = Math.round(state.stepIdx);
  const ticks   = Math.round(state.ticksInPhase);
  const loops   = Math.round(state.loops);

  if (phase === PHASE_ARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(PHASE_TAKEOFF, 0, 0, 1, HOME_STEP, HOME, dist3(state.pos, HOME), loops);
    }
    return makeOut(PHASE_ARMING, 0, ticks + 1, 0, HOME_STEP, HOME, 0, loops);
  }

  if (phase === PHASE_TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      return navigateStep(0, 0, state.pos, loops);
    }
    return makeOut(
      PHASE_TAKEOFF, 0, ticks + 1, 1, HOME_STEP, HOME, dist3(state.pos, HOME), loops,
      HOME, STEPS_A[0].center,
    );
  }

  if (phase === PHASE_NAVIGATE) {
    const step: WindowStep = STEPS_A[stepIdx];
    const timedOut = step.timeout !== undefined && ticks >= step.timeout;
    const status   = timedOut ? STATUS_FAILED : Math.round(state.statusWindow);

    if (status === STATUS_COMPLETED) {
      const next = stepIdx + 1;
      if (next >= STEPS_A.length) {
        return makeOut(
          PHASE_RTH, stepIdx, 0, 1,
          HOME_STEP, HOME, dist3(state.pos, HOME), loops,
          step.center, HOME,
        );
      }
      return navigateStep(next, 0, state.pos, loops);
    }

    if (status === STATUS_FAILED) {
      const anchor = recoveryAnchor(stepIdx);
      return makeOut(
        PHASE_MISSED, stepIdx, 0, 1,
        recoveryStep(stepIdx), anchor, dist3(state.pos, anchor), loops,
        step.center, anchor,
      );
    }

    if (status === STATUS_RESTART) {
      return navigateStep(stepIdx, 0, state.pos, loops);
    }

    return navigateStep(stepIdx, ticks + 1, state.pos, loops);
  }

  if (phase === PHASE_MISSED) {
    const anchor = recoveryAnchor(stepIdx);
    const d = dist3(state.pos, anchor);
    if (d < RTH_THRESHOLD) {
      return navigateStep(stepIdx, 0, state.pos, loops);
    }
    return makeOut(
      PHASE_MISSED, stepIdx, ticks + 1, 1,
      recoveryStep(stepIdx), anchor, d, loops,
      STEPS_A[stepIdx].center, anchor,
    );
  }

  if (phase === PHASE_RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return makeOut(
        PHASE_LAND, 0, 0, 1,
        LAND_STEP, LAND_PAD, dist3(state.pos, LAND_PAD), loops,
        HOME, LAND_PAD,
      );
    }
    return makeOut(
      PHASE_RTH, stepIdx, ticks + 1, 1, HOME_STEP, HOME, d, loops,
      STEPS_A[STEPS_A.length - 1].center, HOME,
    );
  }

  if (phase === PHASE_LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return makeOut(PHASE_DISARMING, 0, 0, 0, LAND_STEP, LAND_PAD, d, loops);
    }
    return makeOut(PHASE_LAND, 0, ticks + 1, 1, LAND_STEP, LAND_PAD, d, loops, HOME, LAND_PAD);
  }

  if (phase === PHASE_DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(PHASE_DONE, 0, 0, 0, LAND_STEP, LAND_PAD, 0, loops);
    }
    return makeOut(PHASE_DISARMING, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0, loops);
  }

  // PHASE_DONE — wait 20 ticks then restart; bump loops counter on restart.
  if (ticks >= 20) {
    return makeOut(PHASE_ARMING, 0, 0, 0, HOME_STEP, HOME, 0, loops + 1);
  }
  return makeOut(PHASE_DONE, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0, loops);
}
