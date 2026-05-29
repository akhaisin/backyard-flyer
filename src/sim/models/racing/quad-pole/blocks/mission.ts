// Pole-circling mission: arm → takeoff → fly to staging point → coordinated
// sweep around the pole → return home → land → disarm → restart.
//
// Steps (executed during NAVIGATE phase):
//   0: waypoint — staging point east of the pole at cruise altitude
//   1: maneuver — lefthanded 2D coordinated sweep (5 s)
//
// `missionType` selects which planner/navigator stack is active downstream:
//   MISSION_WP (0)       — planner_wp + navigator_wp drive the AETR sticks
//   MISSION_3DTURN (1)   — planner_3dturn + navigator_3dturn drive them
//
// Maneuver steps advance on elapsed time (ticksInPhase * DT >= duration);
// waypoint steps advance on distance threshold.

type Vec3 = { x: number; y: number; z: number };

// `type` names the planner/navigator stack responsible for this step's AETR
// output. 'wp' → planner_wp + navigator_wp; '3dturn' → planner_3dturn +
// navigator_3dturn. The numeric `missionType` in MissionOut mirrors this for
// downstream blocks (block state must be numeric).
type StepDef =
  | { type: 'wp';     pos: Vec3; threshold: number }
  | { type: '3dturn'; maneuverIdx: number; durationTicks: number };

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
};

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  target: Vec3;
  missionType: number;     // MISSION_WP | MISSION_3DTURN
  maneuverIdx: number;     // valid only when missionType === MISSION_3DTURN, -1 otherwise
  dist: number;
};

const ARMING    = 0;
const TAKEOFF   = 1;
const NAVIGATE  = 2;
const RTH       = 3;
const LAND      = 4;
const DISARMING = 5;
const DONE      = 6;

const MISSION_WP     = 0;
const MISSION_3DTURN = 1;

const CRUISE_ALT = 3;

// Pole sits at world (POLE.x, 0..POLE_HEIGHT, POLE.z). Staging is 3 m east of
// the pole so the drone enters with the pole on its left side.
export const POLE: Vec3 = { x: 8, y: 0, z: 0 };
export const POLE_HEIGHT = 5;
const STAGING: Vec3     = { x: 8, y: CRUISE_ALT, z: 3 };
const HOME: Vec3        = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3    = { x: 0, y: 0, z: 0 };

// Durations are duplicated from planner_3dturn's MANEUVERS table
// (5 s × 20 Hz = 100 ticks for sweep-left). Keep in sync if the maneuver
// duration changes.
export const STEPS: StepDef[] = [
  { type: 'wp',     pos: STAGING, threshold: 0.4 },
  { type: '3dturn', maneuverIdx: 0, durationTicks: 100 },
];

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  target: Vec3, missionType: number, maneuverIdx: number, dist: number,
): MissionOut {
  return { phase, stepIdx, ticksInPhase, armed, target, missionType, maneuverIdx, dist };
}

export function mission(state: MissionIn): MissionOut {
  const phase   = Math.round(state.phase);
  const stepIdx = Math.round(state.stepIdx);
  const ticks   = Math.round(state.ticksInPhase);

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(TAKEOFF, 0, 0, 1, HOME, MISSION_WP, -1, dist3(state.pos, HOME));
    }
    return makeOut(ARMING, 0, ticks + 1, 0, HOME, MISSION_WP, -1, 0);
  }

  if (phase === TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      const s = STEPS[0] as Extract<StepDef, { type: 'wp' }>;
      return makeOut(NAVIGATE, 0, 0, 1, s.pos, MISSION_WP, -1, dist3(state.pos, s.pos));
    }
    return makeOut(TAKEOFF, 0, ticks + 1, 1, HOME, MISSION_WP, -1, dist3(state.pos, HOME));
  }

  if (phase === NAVIGATE) {
    const step = STEPS[stepIdx];

    if (step.type === 'wp') {
      const d = dist3(state.pos, step.pos);
      if (d < step.threshold) {
        const next = stepIdx + 1;
        if (next >= STEPS.length) {
          return makeOut(RTH, stepIdx, 0, 1, HOME, MISSION_WP, -1, dist3(state.pos, HOME));
        }
        const ns = STEPS[next];
        if (ns.type === 'wp') {
          return makeOut(NAVIGATE, next, 0, 1, ns.pos, MISSION_WP, -1, dist3(state.pos, ns.pos));
        }
        // 3dturn next — anchor target to current pos (visual only; planner_wp short-circuits).
        return makeOut(NAVIGATE, next, 0, 1, state.pos, MISSION_3DTURN, ns.maneuverIdx, 0);
      }
      return makeOut(NAVIGATE, stepIdx, ticks + 1, 1, step.pos, MISSION_WP, -1, d);
    }

    // 3dturn step — advance on elapsed time.
    if (ticks + 1 >= step.durationTicks) {
      const next = stepIdx + 1;
      if (next >= STEPS.length) {
        return makeOut(RTH, stepIdx, 0, 1, HOME, MISSION_WP, -1, dist3(state.pos, HOME));
      }
      const ns = STEPS[next];
      if (ns.type === 'wp') {
        return makeOut(NAVIGATE, next, 0, 1, ns.pos, MISSION_WP, -1, dist3(state.pos, ns.pos));
      }
      return makeOut(NAVIGATE, next, 0, 1, state.pos, MISSION_3DTURN, ns.maneuverIdx, 0);
    }
    return makeOut(NAVIGATE, stepIdx, ticks + 1, 1, state.pos, MISSION_3DTURN, step.maneuverIdx, 0);
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return makeOut(LAND, 0, 0, 1, LAND_PAD, MISSION_WP, -1, dist3(state.pos, LAND_PAD));
    }
    return makeOut(RTH, stepIdx, ticks + 1, 1, HOME, MISSION_WP, -1, d);
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return makeOut(DISARMING, 0, 0, 0, LAND_PAD, MISSION_WP, -1, d);
    }
    return makeOut(LAND, 0, ticks + 1, 1, LAND_PAD, MISSION_WP, -1, d);
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(DONE, 0, 0, 0, LAND_PAD, MISSION_WP, -1, 0);
    }
    return makeOut(DISARMING, 0, ticks + 1, 0, LAND_PAD, MISSION_WP, -1, 0);
  }

  // DONE — restart
  if (ticks >= 20) {
    return makeOut(ARMING, 0, 0, 0, HOME, MISSION_WP, -1, 0);
  }
  return makeOut(DONE, 0, ticks + 1, 0, LAND_PAD, MISSION_WP, -1, 0);
}
