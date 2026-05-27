// Window-gate mission for vehicle A (original track at z = 0).
// Identical logic to w1a/mission.ts with a `loops` counter added:
// `loops` increments each time the full circuit (DONE → ARMING) restarts.

type Vec3 = { x: number; y: number; z: number };

export type WindowDef = {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
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

const CRUISE_ALT = 5;
// Track A centred at (-15, 5, 15) — the -x/+z quadrant.
const X_OFF = -15;
const Z_OFF =  15;
const HOME: Vec3     = { x: X_OFF, y: CRUISE_ALT, z: Z_OFF };
const LAND_PAD: Vec3 = { x: X_OFF, y: 0,          z: Z_OFF };

export const WINDOWS_A: WindowDef[] = [
  { center: { x: 10 + X_OFF, y: CRUISE_ALT, z: -10 + Z_OFF }, normal: { x: 1, y: 0, z: 0 },  width: 5, height: 5 },
  { center: { x: 10 + X_OFF, y: CRUISE_ALT, z:  10 + Z_OFF }, normal: { x: 0, y: 0, z: 1 },  width: 5, height: 5 },
  { center: { x:-10 + X_OFF, y: CRUISE_ALT, z:  10 + Z_OFF }, normal: { x:-1, y: 0, z: 0 },  width: 5, height: 5 },
  { center: { x:-10 + X_OFF, y: CRUISE_ALT, z: -10 + Z_OFF }, normal: { x: 0, y: 0, z:-1 },  width: 5, height: 5 },
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

export function mission_a(state: MissionIn): MissionOut {
  const phase  = Math.round(state.phase);
  const winIdx = Math.round(state.windowIdx);
  const ticks  = Math.round(state.ticksInPhase);
  const loops  = Math.round(state.loops);

  const noWin: Vec3 = { ...HOME };

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return { phase: TAKEOFF, windowIdx: 0, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: noWin, windowNormal: WINDOWS_A[0].normal, dist: dist3(state.pos, HOME), loops };
    }
    return { phase: ARMING, windowIdx: 0, ticksInPhase: ticks + 1, armed: 0, windowSide: 0,
             windowCenter: noWin, windowNormal: WINDOWS_A[0].normal, dist: 0, loops };
  }

  if (phase === TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      const win0 = WINDOWS_A[0];
      return { phase: NAVIGATE, windowIdx: 0, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: win0.center, windowNormal: win0.normal, dist: dist3(state.pos, win0.center), loops };
    }
    return { phase: TAKEOFF, windowIdx: 0, ticksInPhase: ticks + 1, armed: 1, windowSide: 0,
             windowCenter: noWin, windowNormal: WINDOWS_A[0].normal, dist: dist3(state.pos, HOME), loops };
  }

  if (phase === NAVIGATE) {
    const win = WINDOWS_A[winIdx];
    const score = sideScore(state.pos, win);
    const currentSide = score > 0 ? 1 : -1;
    const prevSide = Math.round(state.windowSide);

    if (prevSide === 0) {
      return { phase: NAVIGATE, windowIdx: winIdx, ticksInPhase: ticks + 1, armed: 1,
               windowSide: currentSide, windowCenter: win.center, windowNormal: win.normal,
               dist: dist3(state.pos, win.center), loops };
    }

    const planeCrossed = prevSide === -1 && currentSide === 1;
    const withinFrame  = perpDist(state.pos, win) < Math.max(win.width, win.height) / 2;

    if (planeCrossed && withinFrame) {
      const next = winIdx + 1;
      if (next >= WINDOWS_A.length) {
        return { phase: RTH, windowIdx: winIdx, ticksInPhase: 0, armed: 1, windowSide: 0,
                 windowCenter: HOME, windowNormal: WINDOWS_A[0].normal, dist: dist3(state.pos, HOME), loops };
      }
      const nextWin = WINDOWS_A[next];
      return { phase: NAVIGATE, windowIdx: next, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: nextWin.center, windowNormal: nextWin.normal,
               dist: dist3(state.pos, nextWin.center), loops };
    }

    if (planeCrossed && !withinFrame) {
      const recoveryCenter = winIdx > 0 ? WINDOWS_A[winIdx - 1].center : HOME;
      return { phase: MISSED, windowIdx: winIdx, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: recoveryCenter, windowNormal: win.normal,
               dist: dist3(state.pos, recoveryCenter), loops };
    }

    return { phase: NAVIGATE, windowIdx: winIdx, ticksInPhase: ticks + 1, armed: 1,
             windowSide: currentSide, windowCenter: win.center, windowNormal: win.normal,
             dist: dist3(state.pos, win.center), loops };
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return { phase: LAND, windowIdx: 0, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: dist3(state.pos, LAND_PAD), loops };
    }
    return { phase: RTH, windowIdx: winIdx, ticksInPhase: ticks + 1, armed: 1, windowSide: 0,
             windowCenter: HOME, windowNormal: WINDOWS_A[0].normal, dist: d, loops };
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return { phase: DISARMING, windowIdx: 0, ticksInPhase: 0, armed: 0, windowSide: 0,
               windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: d, loops };
    }
    return { phase: LAND, windowIdx: 0, ticksInPhase: ticks + 1, armed: 1, windowSide: 0,
             windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: d, loops };
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return { phase: DONE, windowIdx: 0, ticksInPhase: 0, armed: 0, windowSide: 0,
               windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: 0, loops };
    }
    return { phase: DISARMING, windowIdx: 0, ticksInPhase: ticks + 1, armed: 0, windowSide: 0,
             windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: 0, loops };
  }

  if (phase === MISSED) {
    const recoveryCenter = winIdx > 0 ? WINDOWS_A[winIdx - 1].center : HOME;
    const d = dist3(state.pos, recoveryCenter);
    if (d < RTH_THRESHOLD) {
      const win = WINDOWS_A[winIdx];
      return { phase: NAVIGATE, windowIdx: winIdx, ticksInPhase: 0, armed: 1, windowSide: 0,
               windowCenter: win.center, windowNormal: win.normal,
               dist: dist3(state.pos, win.center), loops };
    }
    return { phase: MISSED, windowIdx: winIdx, ticksInPhase: ticks + 1, armed: 1, windowSide: 0,
             windowCenter: recoveryCenter, windowNormal: WINDOWS_A[winIdx].normal, dist: d, loops };
  }

  // DONE — wait 20 ticks then restart; increment loops counter on restart.
  if (ticks >= 20) {
    return { phase: ARMING, windowIdx: 0, ticksInPhase: 0, armed: 0, windowSide: 0,
             windowCenter: noWin, windowNormal: WINDOWS_A[0].normal, dist: 0, loops: loops + 1 };
  }
  return { phase: DONE, windowIdx: 0, ticksInPhase: ticks + 1, armed: 0, windowSide: 0,
           windowCenter: LAND_PAD, windowNormal: WINDOWS_A[0].normal, dist: 0, loops };
}
