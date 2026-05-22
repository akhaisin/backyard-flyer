// Mission sequencer: arm → takeoff → navigate 4-waypoint rectangle → land → disarm.
// Phase is an integer encoded as a number in state. All transitions are pure logic.

type Vec3 = { x: number; y: number; z: number };

type MissionIn = {
  pos: Vec3;
  phase: number;
  waypointIdx: number;
  ticksInPhase: number;
  armed: number;
};

type MissionOut = {
  phase: number;
  waypointIdx: number;
  ticksInPhase: number;
  armed: number;
  target: Vec3;
  dist: number;
};

const ARMING = 0;
const TAKEOFF = 1;
const NAVIGATE = 2;
const RTH = 3;
const LAND = 4;
const DISARMING = 5;
const DONE = 6;

const CRUISE_ALT = 5;
const HOME: Vec3 = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0, z: 0 };

const WAYPOINTS: Vec3[] = [
  { x: 8, y: CRUISE_ALT, z: 0 },
  { x: 8, y: CRUISE_ALT, z: 8 },
  { x: 0, y: CRUISE_ALT, z: 8 },
  { x: 0, y: CRUISE_ALT, z: 0 },
];

const ARMING_TICKS = 20;
const THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function mission(state: MissionIn): MissionOut {
  const phase = Math.round(state.phase);
  const wpIdx = Math.round(state.waypointIdx);
  const ticks = Math.round(state.ticksInPhase);

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return { phase: TAKEOFF, waypointIdx: 0, ticksInPhase: 0, armed: 1, target: HOME, dist: dist3(state.pos, HOME) };
    }
    return { phase: ARMING, waypointIdx: 0, ticksInPhase: ticks + 1, armed: 0, target: LAND_PAD, dist: 0 };
  }

  if (phase === TAKEOFF) {
    const d = dist3(state.pos, HOME);
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      return { phase: NAVIGATE, waypointIdx: 0, ticksInPhase: 0, armed: 1, target: WAYPOINTS[0], dist: dist3(state.pos, WAYPOINTS[0]) };
    }
    return { phase: TAKEOFF, waypointIdx: 0, ticksInPhase: ticks + 1, armed: 1, target: HOME, dist: d };
  }

  if (phase === NAVIGATE) {
    const wp = WAYPOINTS[wpIdx];
    const d = dist3(state.pos, wp);
    if (d < THRESHOLD) {
      const next = wpIdx + 1;
      if (next >= WAYPOINTS.length) {
        return { phase: RTH, waypointIdx: wpIdx, ticksInPhase: 0, armed: 1, target: HOME, dist: dist3(state.pos, HOME) };
      }
      return { phase: NAVIGATE, waypointIdx: next, ticksInPhase: 0, armed: 1, target: WAYPOINTS[next], dist: dist3(state.pos, WAYPOINTS[next]) };
    }
    return { phase: NAVIGATE, waypointIdx: wpIdx, ticksInPhase: ticks + 1, armed: 1, target: wp, dist: d };
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < THRESHOLD) {
      return { phase: LAND, waypointIdx: 0, ticksInPhase: 0, armed: 1, target: LAND_PAD, dist: dist3(state.pos, LAND_PAD) };
    }
    return { phase: RTH, waypointIdx: wpIdx, ticksInPhase: ticks + 1, armed: 1, target: HOME, dist: d };
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return { phase: DISARMING, waypointIdx: 0, ticksInPhase: 0, armed: 0, target: LAND_PAD, dist: d };
    }
    return { phase: LAND, waypointIdx: 0, ticksInPhase: ticks + 1, armed: 1, target: LAND_PAD, dist: d };
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return { phase: DONE, waypointIdx: 0, ticksInPhase: 0, armed: 0, target: LAND_PAD, dist: 0 };
    }
    return { phase: DISARMING, waypointIdx: 0, ticksInPhase: ticks + 1, armed: 0, target: LAND_PAD, dist: 0 };
  }

  // DONE — stay here
  return { phase: DONE, waypointIdx: 0, ticksInPhase: 0, armed: 0, target: LAND_PAD, dist: 0 };
}
