// Pole-circling mission: arm → takeoff → fly to staging point → coordinated
// sweep around the pole → return home → land → disarm → restart.
//
// Mission owns step sequencing only. Each step's execution and completion
// check live in the per-type planner block (planner_wp, planner_cturn, ...).
// Each planner reports a status each tick; mission reads it next tick and
// dispatches on PHASE_NAVIGATE:
//   STATUS_RUNNING   → tick++
//   STATUS_COMPLETED → advance stepIdx (or PHASE_RTH if last)
//   STATUS_FAILED    → abort to PHASE_RTH
//   STATUS_RESTART   → reset ticksInPhase, stay on current stepIdx
// If step.timeout is set and ticksInPhase reaches it, mission overrides the
// reported status to FAILED. Timeouts only apply in PHASE_NAVIGATE.

type Vec3 = { x: number; y: number; z: number };

// `type` discriminates the planner/navigator stack for this step. `pos` is the
// step anchor (target for wp; geometric center of the turn for cturn).
// `timeout` (ticks) caps how long mission stays on this step before forcing
// a failure.
type StepExtras = {
  wp: {
    threshold: number;
  };
  'cturn': {
    waypoints: Vec3[];
    durationTicks: number;
  };
};

type StepType = keyof StepExtras;

type StepDef = {
  [K in StepType]: { type: K; pos: Vec3; timeout?: number } & StepExtras[K]
}[StepType];

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  statusWp: number;
  statusCturn: number;
};

// Numeric projection of the active step published on the bus. ModelState
// allows nested objects, primitives, and arrays — so Vec3[] waypoints flow
// through verbatim. Strings still don't fit, which is why the type
// discriminator is kept off the bus (planners gate on missionType).
type StepBus = {
  pos: Vec3;
  threshold: number;     // wp-only; 0 for cturn
  durationTicks: number; // cturn-only; 0 for wp
  waypoints: Vec3[];     // cturn-only; [] for wp
};

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  step: StepBus;
  target: Vec3;
  missionType: number;
  dist: number;
};

export const PHASE_ARMING    = 0;
export const PHASE_TAKEOFF   = 1;
export const PHASE_NAVIGATE  = 2;
export const PHASE_RTH       = 3;
export const PHASE_LAND      = 4;
export const PHASE_DISARMING = 5;
export const PHASE_DONE      = 6;

export const MISSION_WP    = 0;
export const MISSION_CTURN = 1;

export const STATUS_RUNNING   = 0;
export const STATUS_COMPLETED = 1;
export const STATUS_FAILED    = 2;
export const STATUS_RESTART   = 3;

const CRUISE_ALT = 3;

// Pole sits at world (POLE.x, 0..POLE_HEIGHT, POLE.z). Staging is 3 m east of
// the pole so the drone enters with the pole on its left side.
export const POLE: Vec3 = { x: 8, y: 0, z: 0 };
export const POLE_HEIGHT = 5;
const STAGING: Vec3  = { x: 4, y: CRUISE_ALT, z: 0 };
const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0, z: 0 };

// Coordinated-turn arc: 3 waypoints define a circle in xz; planner_cturn fits
// it and derives bank angle + yaw rate from the arc geometry and the requested
// duration (durationTicks * DT). 70 ticks = 3.5 s; tune as needed.
export const STEPS = [
  { type: 'wp', pos: STAGING, threshold: 0.4 },
  {
    type: 'cturn',
    pos: { x: 12, y: CRUISE_ALT, z: 0 },
    waypoints: [
      { x: 8,  y: CRUISE_ALT, z: -3.0 },
      { x: 12, y: CRUISE_ALT, z:  0   },
      { x: 8,  y: CRUISE_ALT, z: +3.0 },
    ],
    durationTicks: 70,
  },
] satisfies StepDef[];

// Scaffolding "steps" published during phases outside PHASE_NAVIGATE so the
// bus always carries a valid step blob for downstream planners. Planners gate
// on phase + missionType, so these never trigger completion checks — they
// just supply pos for the WP cascade during TAKEOFF/RTH/LAND.
const HOME_STEP: StepDef = { type: 'wp', pos: HOME,     threshold: 0.4 };
const LAND_STEP: StepDef = { type: 'wp', pos: LAND_PAD, threshold: 0.3 };

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function missionTypeOf(type: StepType): number {
  return type === 'wp' ? MISSION_WP : MISSION_CTURN;
}

function stepToBus(step: StepDef): StepBus {
  if (step.type === 'wp') {
    return { pos: step.pos, threshold: step.threshold, durationTicks: 0, waypoints: [] };
  }
  return {
    pos: step.pos,
    threshold: 0,
    durationTicks: step.durationTicks,
    waypoints: step.waypoints,
  };
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  step: StepDef, target: Vec3, dist: number,
): MissionOut {
  return {
    phase, stepIdx, ticksInPhase, armed,
    step: stepToBus(step),
    target,
    missionType: missionTypeOf(step.type),
    dist,
  };
}

// Build a NAVIGATE output for `stepIdx`. Target/dist only meaningful for wp
// steps; cturn anchors target to drone pos so the visual waypoint sphere
// doesn't appear underfoot during the sweep.
function navigateStep(stepIdx: number, ticks: number, pos: Vec3): MissionOut {
  const step   = STEPS[stepIdx];
  const target = step.type === 'wp' ? step.pos : pos;
  const dist   = step.type === 'wp' ? dist3(pos, step.pos) : 0;
  return makeOut(PHASE_NAVIGATE, stepIdx, ticks, 1, step, target, dist);
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
    // Widen to StepDef so the optional `timeout` field stays visible; the
    // `satisfies` narrowing on STEPS strips it from each literal type.
    const step: StepDef = STEPS[stepIdx];
    const rawStatus = step.type === 'wp' ? state.statusWp : state.statusCturn;
    const timedOut  = step.timeout !== undefined && ticks >= step.timeout;
    const status    = timedOut ? STATUS_FAILED : Math.round(rawStatus);

    if (status === STATUS_COMPLETED) {
      const next = stepIdx + 1;
      if (next >= STEPS.length) {
        return makeOut(PHASE_RTH, stepIdx, 0, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
      }
      return navigateStep(next, 0, state.pos);
    }

    if (status === STATUS_FAILED) {
      return makeOut(PHASE_RTH, stepIdx, 0, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
    }

    if (status === STATUS_RESTART) {
      return navigateStep(stepIdx, 0, state.pos);
    }

    // STATUS_RUNNING (default)
    return navigateStep(stepIdx, ticks + 1, state.pos);
  }

  if (phase === PHASE_RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return makeOut(PHASE_LAND, 0, 0, 1, LAND_STEP, LAND_PAD, dist3(state.pos, LAND_PAD));
    }
    return makeOut(PHASE_RTH, stepIdx, ticks + 1, 1, HOME_STEP, HOME, d);
  }

  if (phase === PHASE_LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return makeOut(PHASE_DISARMING, 0, 0, 0, LAND_STEP, LAND_PAD, d);
    }
    return makeOut(PHASE_LAND, 0, ticks + 1, 1, LAND_STEP, LAND_PAD, d);
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
