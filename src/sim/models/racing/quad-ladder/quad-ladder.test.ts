import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSim, startSim, getStatic, getHistory } from '../../../engine/engine';
import { quadLadderConfig, debugEnabled } from './quad-ladder.config';
import { STEP_TYPE_CTURN } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';

vi.mock('./quad-ladder.vis', () => ({ default: () => null }));

// These tests fly the real QUAD_LADDER_ROUTE end-to-end and score how closely the
// drone tracks the intended path, accumulating cross-track error over every
// NAVIGATE tick (IAE). Two flavours:
//   • debug mode  — straight legs; error = distance to the active line segment.
//   • coordinated — real arcs;     error = radial+altitude distance to the cturn
//                   arc (plain WP steps still use perpendicular segment distance).

type Vec3 = { x: number; y: number; z: number };
const NAVIGATE = 2;

// ── Geometry helpers ────────────────────────────────────────────────────────────

function distPointToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  const t = ab2 > 0
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2))
    : 0;
  const cx = a.x + t * abx, cy = a.y + t * aby, cz = a.z + t * abz;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

// Minimum distance to a polyline (consecutive segments through the points).
function distToPolyline(p: Vec3, pts: Vec3[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    best = Math.min(best, distPointToSegment(p, pts[i], pts[i + 1]));
  }
  return best;
}

// Circle through 3 points in the xz plane (mirrors planner_cturn.fitCircleXZ).
function fitCircleXZ(w0: Vec3, w1: Vec3, w2: Vec3): { cx: number; cz: number; r: number } | null {
  const ax = w1.x - w0.x, az = w1.z - w0.z;
  const bx = w2.x - w0.x, bz = w2.z - w0.z;
  const d = 2 * (ax * bz - az * bx);
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + az * az;
  const b2 = bx * bx + bz * bz;
  const ux = (bz * a2 - az * b2) / d;
  const uz = (ax * b2 - bx * a2) / d;
  return { cx: w0.x + ux, cz: w0.z + uz, r: Math.sqrt(ux * ux + uz * uz) };
}

// Distance to the cturn arc: radial deviation in xz, combined with altitude
// deviation from the intended climb (entry.y → exit.y, linear in swept angle).
function distToArc(p: Vec3, w0: Vec3, w1: Vec3, w2: Vec3): number {
  const c = fitCircleXZ(w0, w1, w2);
  if (!c) return distToPolyline(p, [w0, w1, w2]);
  const { cx, cz, r } = c;

  const th0 = Math.atan2(w0.z - cz, w0.x - cx);
  const th2 = Math.atan2(w2.z - cz, w2.x - cx);
  const th1 = Math.atan2(w1.z - cz, w1.x - cx);
  const thp = Math.atan2(p.z - cz, p.x - cx);

  // Signed sweep th0→th2 passing through th1 (same logic as planner.arcSweep).
  const TWO_PI = 2 * Math.PI;
  const dCcw = ((th2 - th0) % TWO_PI + TWO_PI) % TWO_PI;
  const m    = ((th1 - th0) % TWO_PI + TWO_PI) % TWO_PI;
  const sweep = m < dCcw ? dCcw : dCcw - TWO_PI;

  const dir = Math.sign(sweep) || 1;
  let prog = ((thp - th0) * dir % TWO_PI + TWO_PI) % TWO_PI; // 0..2π along sweep dir
  const frac = Math.max(0, Math.min(1, prog / Math.abs(sweep)));
  const intendedY = w0.y + (w2.y - w0.y) * frac;

  const radialXZ = Math.abs(Math.hypot(p.x - cx, p.z - cz) - r);
  const altErr   = Math.abs(p.y - intendedY);
  return Math.hypot(radialXZ, altErr);
}

// ── Per-frame path error ────────────────────────────────────────────────────────

function frameError(frame: ModelState, arcMode: boolean): number {
  const m    = frame.mission as ModelState;
  const step = m.step as ModelState;
  const pos  = frame.pos as Vec3;
  const isCturn = Math.round((step.stepType ?? 0) as number) === STEP_TYPE_CTURN;

  if (isCturn) {
    const wps = step.waypoints as Vec3[];
    if (!Array.isArray(wps) || wps.length < 3) return 0;
    return arcMode
      ? distToArc(pos, wps[0], wps[1], wps[2])     // coordinated: error vs arc
      : distToPolyline(pos, wps);                  // debug: error vs straight legs
  }
  // Plain WP step: perpendicular distance to the active mission segment.
  return distPointToSegment(pos, m.segStart as Vec3, m.segEnd as Vec3);
}

interface Score { acc: number; mean: number; max: number; frames: number }
const SIM_DT = 0.05;

function straightSpeedStats(history: ModelState[]): { avg: number; p90: number; samples: number } {
  const speeds: number[] = [];
  let entered = false;
  for (const f of history) {
    const m = f.mission as ModelState;
    const navigating = Math.round(m.phase as number) === NAVIGATE;
    if (navigating) {
      entered = true;
      const step = m.step as ModelState;
      const isCturn = Math.round((step.stepType ?? 0) as number) === STEP_TYPE_CTURN;
      if (!isCturn) {
        const vel = f.vel as Vec3;
        speeds.push(Math.hypot(vel.x, vel.z));
      }
    } else if (entered) {
      break;
    }
  }
  if (speeds.length === 0) return { avg: 0, p90: 0, samples: 0 };
  const sorted = [...speeds].sort((a, b) => a - b);
  const p90Idx = Math.min(sorted.length - 1, Math.floor(0.9 * (sorted.length - 1)));
  const avg = speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  return { avg, p90: sorted[p90Idx], samples: speeds.length };
}

// Score the first lap only: the contiguous NAVIGATE run from takeoff to RTH. The
// sim re-arms and re-flies once a lap completes (simDuration spans several laps),
// so we stop at the first NAVIGATE→non-NAVIGATE transition.
function scoreRoute(history: ModelState[], arcMode: boolean): Score {
  let acc = 0, max = 0, frames = 0, entered = false;
  for (const f of history) {
    const navigating = Math.round((f.mission as ModelState).phase as number) === NAVIGATE;
    if (navigating) {
      entered = true;
      const e = frameError(f, arcMode);
      acc += e;
      if (e > max) max = e;
      frames++;
    } else if (entered) {
      break; // first lap finished
    }
  }
  return { acc, mean: frames ? acc / frames : 0, max, frames };
}

// ── Sim runner ──────────────────────────────────────────────────────────────────

function runRoute(simId: string, debug: boolean): ModelState[] {
  debugEnabled.enabled = debug;
  const config = quadLadderConfig({ simDuration: 1400, MAX_TICKS: 1400 });
  initSim(simId, config);
  startSim(simId);
  const K = getStatic(simId).K as ModelState;
  vi.advanceTimersByTime(config.tickIntervalMs * ((K.simDuration as number) + 1));
  return getHistory(simId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('quad-ladder route', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    debugEnabled.enabled = true; // restore default
  });

  it('debug mode tracks the straight legs within accumulated-error budget', () => {
    const history = runRoute('ladder-debug', true);
    const s = scoreRoute(history, false);

    // Reference run (deterministic, noise/wind off): frames≈693, acc≈1123,
    // mean≈1.62, max≈5.43. The gate weave tracks <1 m; the budget headroom covers
    // the staging approach and the wide return arc's corner-rounding. A regression
    // into the old leg-handoff tumble pushed max past 20 m, which these catch.
    expect(s.frames, 'too few NAVIGATE frames').toBeGreaterThan(100);
    expect(s.max,  `max cross-track ${s.max.toFixed(2)} m`).toBeLessThan(7.0);
    expect(s.mean, `mean cross-track ${s.mean.toFixed(3)} m`).toBeLessThan(2.5);
    expect(s.acc,  `accumulated error ${s.acc.toFixed(1)} m`).toBeLessThan(1800);
  });

  it('coordinated mode tracks the arcs within accumulated-error budget', () => {
    const history = runRoute('ladder-arc', false);
    const s = scoreRoute(history, true);
    const straight = straightSpeedStats(history);
    const lapSeconds = s.frames * SIM_DT;
    const BASELINE_LAP_SECONDS = 47.0;

    console.info(
      `[ladder-arc] lapSeconds=${lapSeconds.toFixed(2)} frames=${s.frames}` +
      ` straightAvg=${straight.avg.toFixed(2)}mps straightP90=${straight.p90.toFixed(2)}mps samples=${straight.samples}`,
    );

    expect(s.frames, 'too few NAVIGATE frames').toBeGreaterThan(100);
    expect(s.max,  `max arc error ${s.max.toFixed(2)} m`).toBeLessThan(10.0);
    expect(s.mean, `mean arc error ${s.mean.toFixed(3)} m`).toBeLessThan(1.6);
    expect(s.acc,  `accumulated error ${s.acc.toFixed(1)} m`).toBeLessThan(1600);
    expect(lapSeconds, `lap time ${lapSeconds.toFixed(2)} s`).toBeLessThanOrEqual(BASELINE_LAP_SECONDS);
  });
});
