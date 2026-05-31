// 4-waypoint rectangle mission, restructured around the step/status pattern
// from racing/quad-pole. Mission owns step sequencing only — completion checks
// live in planner_wp. Each tick the planner reports stepStatus and mission
// dispatches on PHASE_NAVIGATE:
//   STATUS_RUNNING   → tick++
//   STATUS_COMPLETED → advance stepIdx (or PHASE_RTH if last)
//   STATUS_FAILED    → abort to PHASE_RTH
//   STATUS_RESTART   → reset ticksInPhase, stay on current stepIdx
// If step.timeout is set and ticksInPhase reaches it, mission overrides the
// reported status to FAILED. Timeouts only apply in PHASE_NAVIGATE.
//
// segStart/segEnd are emitted alongside the new step bus so the cross-track
// validator from quad-l3 keeps working unchanged.

type Vec3 = { x: number; y: number; z: number };

// All steps in this mission are waypoint steps; no mission-type discriminator
// is needed (cf. quad-pole, which mixes wp + cturn).
type StepDef = { pos: Vec3; threshold: number; timeout?: number };

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  statusWp: number;
};

// Numeric projection of the active step published on the bus.
type StepBus = { pos: Vec3; threshold: number };

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  step: StepBus;
  target: Vec3;
  dist: number;
  // Active flight segment. Validator gates on phase; outside NAVIGATE these
  // are degenerate (start = end = target).
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

export const STATUS_RUNNING   = 0;
export const STATUS_COMPLETED = 1;
export const STATUS_FAILED    = 2;
export const STATUS_RESTART   = 3;

const CRUISE_ALT = 5;
const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0,          z: 0 };

export const STEPS: StepDef[] = [
  { pos: { x: 8, y: CRUISE_ALT, z: 0 }, threshold: 1.2 },
  { pos: { x: 8, y: CRUISE_ALT, z: 8 }, threshold: 1.2 },
  { pos: { x: 0, y: CRUISE_ALT, z: 8 }, threshold: 1.2 },
  { pos: { x: 0, y: CRUISE_ALT, z: 0 }, threshold: 1.2 },
];

// Scaffolding steps published during phases outside PHASE_NAVIGATE so the bus
// always carries a valid step blob for planner_wp.
const HOME_STEP: StepDef = { pos: HOME,     threshold: 1.2 };
const LAND_STEP: StepDef = { pos: LAND_PAD, threshold: 0.3 };

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function stepToBus(step: StepDef): StepBus {
  return { pos: step.pos, threshold: step.threshold };
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  step: StepDef, target: Vec3, dist: number,
  segStart: Vec3 = target, segEnd: Vec3 = target,
): MissionOut {
  return {
    phase, stepIdx, ticksInPhase, armed,
    step: stepToBus(step),
    target, dist, segStart, segEnd,
  };
}

function segStartFor(stepIdx: number): Vec3 {
  return stepIdx === 0 ? HOME : STEPS[stepIdx - 1].pos;
}

function navigateStep(stepIdx: number, ticks: number, pos: Vec3): MissionOut {
  const step = STEPS[stepIdx];
  return makeOut(
    PHASE_NAVIGATE, stepIdx, ticks, 1,
    step, step.pos, dist3(pos, step.pos),
    segStartFor(stepIdx), step.pos,
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
    return makeOut(PHASE_TAKEOFF, 0, ticks + 1, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
  }

  if (phase === PHASE_NAVIGATE) {
    const step: StepDef = STEPS[stepIdx];
    const timedOut = step.timeout !== undefined && ticks >= step.timeout;
    const status   = timedOut ? STATUS_FAILED : Math.round(state.statusWp);

    if (status === STATUS_COMPLETED) {
      const next = stepIdx + 1;
      if (next >= STEPS.length) {
        return makeOut(
          PHASE_RTH, stepIdx, 0, 1,
          HOME_STEP, HOME, dist3(state.pos, HOME),
          step.pos, HOME,
        );
      }
      return navigateStep(next, 0, state.pos);
    }

    if (status === STATUS_FAILED) {
      return makeOut(
        PHASE_RTH, stepIdx, 0, 1,
        HOME_STEP, HOME, dist3(state.pos, HOME),
        step.pos, HOME,
      );
    }

    if (status === STATUS_RESTART) {
      return navigateStep(stepIdx, 0, state.pos);
    }

    return navigateStep(stepIdx, ticks + 1, state.pos);
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
    return makeOut(PHASE_RTH, stepIdx, ticks + 1, 1, HOME_STEP, HOME, d, STEPS[stepIdx].pos, HOME);
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
