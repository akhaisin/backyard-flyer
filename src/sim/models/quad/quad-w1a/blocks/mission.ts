// Window-gate mission sequencer: arm → takeoff → fly through 4 rectangular windows → RTH → land → disarm.
// Windows replace waypoints: the drone must physically cross each rectangular gate plane to advance.
// Crossing detection: track which side of the window plane the drone is on; a sign flip while
// within the gate's half-extents counts as a crossing. `windowSide = 0` is the "not yet set"
// sentinel on the first tick for a given window.

type Vec3 = { x: number; y: number; z: number };

export type WindowDef = {
  center: Vec3;
  normal: Vec3;   // unit vector — direction of travel through the gate
  width: number;
  height: number;
  label?: string;
};

type MissionIn = {
  pos: Vec3;
  phase: number;
  windowIdx: number;
  ticksInPhase: number;
  armed: number;
  windowSide: number;  // -1 | 0 | 1  (0 = not yet computed for current window)
};

type MissionOut = {
  phase: number;
  windowIdx: number;
  ticksInPhase: number;
  armed: number;
  windowSide: number;
  windowCenter: Vec3;
  windowNormal: Vec3;
  // Current intended flight segment — during NAVIGATE this is the line from
  // the previous window center (or HOME for the first) to the current window
  // center. Degenerate elsewhere. Downstream validators score actual position
  // against it.
  segStart: Vec3;
  segEnd: Vec3;
  dist: number;
};

const ARMING    = 0;
const TAKEOFF   = 1;
const NAVIGATE  = 2;
const RTH       = 3;
const LAND      = 4;
const DISARMING = 5;
const DONE      = 6;
const MISSED    = 7;

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 5;
const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0, z: 0 };

// 4 gates forming a rectangle. Normal points in the direction of intended travel through each gate.
export const WINDOWS: WindowDef[] = [
  { center: { x: 10, y: CRUISE_ALT, z: -10 }, normal: { x: 1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W1' },
  { center: { x: 10, y: CRUISE_ALT, z: 10 }, normal: { x: 0, y: 0, z: 1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W2' },
  { center: { x: -10, y: CRUISE_ALT, z: 10 }, normal: { x: -1, y: 0, z: 0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W3' },
  { center: { x: -10, y: CRUISE_ALT, z: -10 }, normal: { x: 0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'W4' },
];

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Returns signed distance from pos to the window plane (positive = "exit" side).
function sideScore(pos: Vec3, win: WindowDef): number {
  return (pos.x - win.center.x) * win.normal.x
       + (pos.y - win.center.y) * win.normal.y
       + (pos.z - win.center.z) * win.normal.z;
}

// Perpendicular distance from pos to the window plane center (within-gate check).
function perpDist(pos: Vec3, win: WindowDef): number {
  const score = sideScore(pos, win);
  const rx = (pos.x - win.center.x) - score * win.normal.x;
  const ry = (pos.y - win.center.y) - score * win.normal.y;
  const rz = (pos.z - win.center.z) - score * win.normal.z;
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

// Build a result with the segment fields filled in. Outside NAVIGATE the
// segment is degenerate (start = end = windowCenter) — validator gates on
// phase so the values don't matter there.
function out(
  phase: number, windowIdx: number, ticksInPhase: number, armed: number, windowSide: number,
  windowCenter: Vec3, windowNormal: Vec3, dist: number,
  segStart: Vec3 = windowCenter, segEnd: Vec3 = windowCenter,
): MissionOut {
  return { phase, windowIdx, ticksInPhase, armed, windowSide, windowCenter, windowNormal, segStart, segEnd, dist };
}

function entrySegStart(winIdx: number): Vec3 {
  return winIdx > 0 ? WINDOWS[winIdx - 1].center : HOME;
}

export function mission(state: MissionIn): MissionOut {
  const phase  = Math.round(state.phase);
  const winIdx = Math.round(state.windowIdx);
  const ticks  = Math.round(state.ticksInPhase);

  const noWin: Vec3 = { x: state.pos.x, y: CRUISE_ALT, z: state.pos.z };
  const n0 = WINDOWS[0].normal;

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(TAKEOFF, 0, 0, 1, 0, noWin, n0, dist3(state.pos, HOME));
    }
    return out(ARMING, 0, ticks + 1, 0, 0, noWin, n0, 0);
  }

  if (phase === TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      const win0 = WINDOWS[0];
      return out(NAVIGATE, 0, 0, 1, 0, win0.center, win0.normal, dist3(state.pos, win0.center), HOME, win0.center);
    }
    return out(TAKEOFF, 0, ticks + 1, 1, 0, noWin, n0, dist3(state.pos, HOME));
  }

  if (phase === NAVIGATE) {
    const win = WINDOWS[winIdx];
    const score = sideScore(state.pos, win);
    const currentSide = score > 0 ? 1 : -1;
    const prevSide = Math.round(state.windowSide);
    const segStart = entrySegStart(winIdx);

    // First tick for this window: just record side, no crossing yet.
    if (prevSide === 0) {
      return out(NAVIGATE, winIdx, ticks + 1, 1, currentSide, win.center, win.normal,
                 dist3(state.pos, win.center), segStart, win.center);
    }

    // Only approach→exit (−1 → +1) counts; exit→approach is the drone retreating, not crossing.
    const planeCrossed = prevSide === -1 && currentSide === 1;
    const withinFrame  = perpDist(state.pos, win) < Math.max(win.width, win.height) / 2;

    if (planeCrossed && withinFrame) {
      const next = winIdx + 1;
      if (next >= WINDOWS.length) {
        return out(RTH, winIdx, 0, 1, 0, HOME, n0, dist3(state.pos, HOME), win.center, HOME);
      }
      const nextWin = WINDOWS[next];
      return out(NAVIGATE, next, 0, 1, 0, nextWin.center, nextWin.normal,
                 dist3(state.pos, nextWin.center), win.center, nextWin.center);
    }

    if (planeCrossed && !withinFrame) {
      // Missed: crossed the gate plane but outside the frame. Return to the previous gate
      // center (or HOME for the first gate) as a staging point, then retry this gate.
      const recoveryCenter = entrySegStart(winIdx);
      return out(MISSED, winIdx, 0, 1, 0, recoveryCenter, win.normal,
                 dist3(state.pos, recoveryCenter), win.center, recoveryCenter);
    }

    return out(NAVIGATE, winIdx, ticks + 1, 1, currentSide, win.center, win.normal,
               dist3(state.pos, win.center), segStart, win.center);
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return out(LAND, 0, 0, 1, 0, LAND_PAD, n0, dist3(state.pos, LAND_PAD), HOME, LAND_PAD);
    }
    return out(RTH, winIdx, ticks + 1, 1, 0, HOME, n0, d,
               WINDOWS[WINDOWS.length - 1].center, HOME);
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return out(DISARMING, 0, 0, 0, 0, LAND_PAD, n0, d);
    }
    return out(LAND, 0, ticks + 1, 1, 0, LAND_PAD, n0, d, HOME, LAND_PAD);
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(DONE, 0, 0, 0, 0, LAND_PAD, n0, 0);
    }
    return out(DISARMING, 0, ticks + 1, 0, 0, LAND_PAD, n0, 0);
  }

  if (phase === MISSED) {
    const recoveryCenter = entrySegStart(winIdx);
    const d = dist3(state.pos, recoveryCenter);
    if (d < RTH_THRESHOLD) {
      // Reached the recovery point — re-attempt the missed gate.
      const win = WINDOWS[winIdx];
      return out(NAVIGATE, winIdx, 0, 1, 0, win.center, win.normal,
                 dist3(state.pos, win.center), recoveryCenter, win.center);
    }
    return out(MISSED, winIdx, ticks + 1, 1, 0, recoveryCenter, WINDOWS[winIdx].normal, d);
  }

  // DONE — wait 20 ticks then restart
  if (ticks >= 20) {
    return out(ARMING, 0, 0, 0, 0, noWin, n0, 0);
  }
  return out(DONE, 0, ticks + 1, 0, 0, LAND_PAD, n0, 0);
}
