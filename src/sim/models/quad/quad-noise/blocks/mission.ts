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
  // Current intended flight segment. Meaningful during NAVIGATE
  // (line between consecutive waypoints); degenerate (start = end = target)
  // in other phases. Downstream validators score actual position against it.
  segStart: Vec3;
  segEnd: Vec3;
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

// Build a result with the segment fields filled in. Outside NAVIGATE the
// segment is degenerate (start = end = target) — validator gates on phase so
// the values don't matter; degenerate keeps them visualizable as a point.
function out(
  phase: number, waypointIdx: number, ticksInPhase: number, armed: number,
  target: Vec3, dist: number,
  segStart: Vec3 = target, segEnd: Vec3 = target,
): MissionOut {
  return { phase, waypointIdx, ticksInPhase, armed, target, dist, segStart, segEnd };
}

export function mission(state: MissionIn): MissionOut {
  const phase = Math.round(state.phase);
  const wpIdx = Math.round(state.waypointIdx);
  const ticks = Math.round(state.ticksInPhase);

  const cruisePoint: Vec3 = { x: state.pos.x, y: CRUISE_ALT, z: state.pos.z };

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(TAKEOFF, 0, 0, 1, cruisePoint, dist3(state.pos, cruisePoint));
    }
    return out(ARMING, 0, ticks + 1, 0, cruisePoint, 0);
  }

  if (phase === TAKEOFF) {
    const d = dist3(state.pos, cruisePoint);
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      return out(NAVIGATE, 0, 0, 1, WAYPOINTS[0], dist3(state.pos, WAYPOINTS[0]), HOME, WAYPOINTS[0]);
    }
    return out(TAKEOFF, 0, ticks + 1, 1, cruisePoint, d);
  }

  if (phase === NAVIGATE) {
    const wp = WAYPOINTS[wpIdx];
    const segStart = wpIdx === 0 ? HOME : WAYPOINTS[wpIdx - 1];
    const d = dist3(state.pos, wp);
    if (d < THRESHOLD) {
      const next = wpIdx + 1;
      if (next >= WAYPOINTS.length) {
        return out(RTH, wpIdx, 0, 1, HOME, dist3(state.pos, HOME), wp, HOME);
      }
      return out(NAVIGATE, next, 0, 1, WAYPOINTS[next], dist3(state.pos, WAYPOINTS[next]), wp, WAYPOINTS[next]);
    }
    return out(NAVIGATE, wpIdx, ticks + 1, 1, wp, d, segStart, wp);
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < THRESHOLD) {
      return out(LAND, 0, 0, 1, LAND_PAD, dist3(state.pos, LAND_PAD), HOME, LAND_PAD);
    }
    return out(RTH, wpIdx, ticks + 1, 1, HOME, d, WAYPOINTS[wpIdx], HOME);
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return out(DISARMING, 0, 0, 0, LAND_PAD, d);
    }
    return out(LAND, 0, ticks + 1, 1, LAND_PAD, d, HOME, LAND_PAD);
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(DONE, 0, 0, 0, LAND_PAD, 0);
    }
    return out(DISARMING, 0, ticks + 1, 0, LAND_PAD, 0);
  }

  // DONE — wait 20 ticks then restart from ARMING
  if (phase === DONE && state.ticksInPhase >= 20) {
    return out(ARMING, 0, 0, 0, LAND_PAD, 0);
  }
  return out(DONE, 0, ticks + 1, 0, LAND_PAD, 0);
}
