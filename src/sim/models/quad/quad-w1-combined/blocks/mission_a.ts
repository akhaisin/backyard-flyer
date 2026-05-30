// Window-gate mission for vehicle A (original track at z = 0).
// Identical logic to w1a/mission.ts with a `loops` counter added:
// `loops` increments each time the full circuit (DONE → ARMING) restarts.

type Vec3 = { x: number; y: number; z: number };

export type WindowDef = {
  center: Vec3;
  normal: Vec3;
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
  windowSide: number;
  loops: number;
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
  // center. Degenerate elsewhere.
  segStart: Vec3;
  segEnd: Vec3;
  dist: number;
  loops: number;
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
const WINDOW_SIZE = 4;
// Track A centred at (-15, 5, 15) — the -x/+z quadrant.
const X_OFF = -15;
const Z_OFF =  15;
const HOME: Vec3     = { x: X_OFF, y: CRUISE_ALT, z: Z_OFF };
const LAND_PAD: Vec3 = { x: X_OFF, y: 0,          z: Z_OFF };

export const WINDOWS_A: WindowDef[] = [
  { center: { x: 8 + X_OFF, y: CRUISE_ALT, z: -8 + Z_OFF }, normal: { x: 1, y: 0, z: 0 },  width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A1' },
  { center: { x: 8 + X_OFF, y: CRUISE_ALT, z:  8 + Z_OFF }, normal: { x: 0, y: 0, z: 1 },  width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A2' },
  { center: { x:-8 + X_OFF, y: CRUISE_ALT, z:  8 + Z_OFF }, normal: { x:-1, y: 0, z: 0 },  width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A3' },
  { center: { x:-8 + X_OFF, y: CRUISE_ALT, z: -8 + Z_OFF }, normal: { x: 0, y: 0, z:-1 },  width: WINDOW_SIZE, height: WINDOW_SIZE, label: 'A4' },
];

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sideScore(pos: Vec3, win: WindowDef): number {
  return (pos.x - win.center.x) * win.normal.x
       + (pos.y - win.center.y) * win.normal.y
       + (pos.z - win.center.z) * win.normal.z;
}

function perpDist(pos: Vec3, win: WindowDef): number {
  const score = sideScore(pos, win);
  const rx = (pos.x - win.center.x) - score * win.normal.x;
  const ry = (pos.y - win.center.y) - score * win.normal.y;
  const rz = (pos.z - win.center.z) - score * win.normal.z;
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

// Build a result with the segment fields filled in. Outside NAVIGATE the
// segment is degenerate (start = end = windowCenter); the validator gates
// error accumulation on phase so values don't matter there.
function out(
  phase: number, windowIdx: number, ticksInPhase: number, armed: number, windowSide: number,
  windowCenter: Vec3, windowNormal: Vec3, dist: number, loops: number,
  segStart: Vec3 = windowCenter, segEnd: Vec3 = windowCenter,
): MissionOut {
  return { phase, windowIdx, ticksInPhase, armed, windowSide, windowCenter, windowNormal, segStart, segEnd, dist, loops };
}

function entrySegStart(winIdx: number): Vec3 {
  return winIdx > 0 ? WINDOWS_A[winIdx - 1].center : HOME;
}

export function mission_a(state: MissionIn): MissionOut {
  const phase  = Math.round(state.phase);
  const winIdx = Math.round(state.windowIdx);
  const ticks  = Math.round(state.ticksInPhase);
  const loops  = Math.round(state.loops);

  const noWin: Vec3 = { x: state.pos.x, y: CRUISE_ALT, z: state.pos.z };
  const n0 = WINDOWS_A[0].normal;

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(TAKEOFF, 0, 0, 1, 0, noWin, n0, dist3(state.pos, HOME), loops);
    }
    return out(ARMING, 0, ticks + 1, 0, 0, noWin, n0, 0, loops);
  }

  if (phase === TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      const win0 = WINDOWS_A[0];
      return out(NAVIGATE, 0, 0, 1, 0, win0.center, win0.normal,
                 dist3(state.pos, win0.center), loops, HOME, win0.center);
    }
    return out(TAKEOFF, 0, ticks + 1, 1, 0, noWin, n0, dist3(state.pos, HOME), loops);
  }

  if (phase === NAVIGATE) {
    const win = WINDOWS_A[winIdx];
    const score = sideScore(state.pos, win);
    const currentSide = score > 0 ? 1 : -1;
    const prevSide = Math.round(state.windowSide);
    const segStart = entrySegStart(winIdx);

    if (prevSide === 0) {
      return out(NAVIGATE, winIdx, ticks + 1, 1, currentSide, win.center, win.normal,
                 dist3(state.pos, win.center), loops, segStart, win.center);
    }

    const planeCrossed = prevSide === -1 && currentSide === 1;
    const withinFrame  = perpDist(state.pos, win) < Math.max(win.width, win.height) / 2;

    if (planeCrossed && withinFrame) {
      const next = winIdx + 1;
      if (next >= WINDOWS_A.length) {
        return out(RTH, winIdx, 0, 1, 0, HOME, n0, dist3(state.pos, HOME), loops, win.center, HOME);
      }
      const nextWin = WINDOWS_A[next];
      return out(NAVIGATE, next, 0, 1, 0, nextWin.center, nextWin.normal,
                 dist3(state.pos, nextWin.center), loops, win.center, nextWin.center);
    }

    if (planeCrossed && !withinFrame) {
      const recoveryCenter = entrySegStart(winIdx);
      return out(MISSED, winIdx, 0, 1, 0, recoveryCenter, win.normal,
                 dist3(state.pos, recoveryCenter), loops, win.center, recoveryCenter);
    }

    return out(NAVIGATE, winIdx, ticks + 1, 1, currentSide, win.center, win.normal,
               dist3(state.pos, win.center), loops, segStart, win.center);
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return out(LAND, 0, 0, 1, 0, LAND_PAD, n0, dist3(state.pos, LAND_PAD), loops, HOME, LAND_PAD);
    }
    return out(RTH, winIdx, ticks + 1, 1, 0, HOME, n0, d, loops,
               WINDOWS_A[WINDOWS_A.length - 1].center, HOME);
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return out(DISARMING, 0, 0, 0, 0, LAND_PAD, n0, d, loops);
    }
    return out(LAND, 0, ticks + 1, 1, 0, LAND_PAD, n0, d, loops, HOME, LAND_PAD);
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return out(DONE, 0, 0, 0, 0, LAND_PAD, n0, 0, loops);
    }
    return out(DISARMING, 0, ticks + 1, 0, 0, LAND_PAD, n0, 0, loops);
  }

  if (phase === MISSED) {
    const recoveryCenter = entrySegStart(winIdx);
    const d = dist3(state.pos, recoveryCenter);
    if (d < RTH_THRESHOLD) {
      const win = WINDOWS_A[winIdx];
      return out(NAVIGATE, winIdx, 0, 1, 0, win.center, win.normal,
                 dist3(state.pos, win.center), loops, recoveryCenter, win.center);
    }
    return out(MISSED, winIdx, ticks + 1, 1, 0, recoveryCenter, WINDOWS_A[winIdx].normal, d, loops);
  }

  // DONE — wait 20 ticks then restart; increment loops counter on restart.
  if (ticks >= 20) {
    return out(ARMING, 0, 0, 0, 0, noWin, n0, 0, loops + 1);
  }
  return out(DONE, 0, ticks + 1, 0, 0, LAND_PAD, n0, 0, loops);
}
