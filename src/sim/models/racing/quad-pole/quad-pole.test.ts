import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSim, startSim, getStatic, getHistory } from '../../../engine/engine';
import { quadPoleConfig } from './quad-pole.config';
import { STEP_TYPE_CTURN } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';

vi.mock('./quad-pole.vis', () => ({ default: () => null }));

type Vec3 = { x: number; y: number; z: number };
const NAVIGATE = 2;
const SIM_DT = 0.05;

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

function distToArc(p: Vec3, w0: Vec3, w1: Vec3, w2: Vec3): number {
  const c = fitCircleXZ(w0, w1, w2);
  if (!c) return distPointToSegment(p, w0, w2);
  const { cx, cz, r } = c;

  const th0 = Math.atan2(w0.z - cz, w0.x - cx);
  const th2 = Math.atan2(w2.z - cz, w2.x - cx);
  const th1 = Math.atan2(w1.z - cz, w1.x - cx);
  const thp = Math.atan2(p.z - cz, p.x - cx);

  const TWO_PI = 2 * Math.PI;
  const dCcw = ((th2 - th0) % TWO_PI + TWO_PI) % TWO_PI;
  const m = ((th1 - th0) % TWO_PI + TWO_PI) % TWO_PI;
  const sweep = m < dCcw ? dCcw : dCcw - TWO_PI;

  const dir = Math.sign(sweep) || 1;
  const prog = ((thp - th0) * dir % TWO_PI + TWO_PI) % TWO_PI;
  const frac = Math.max(0, Math.min(1, prog / Math.max(Math.abs(sweep), 1e-6)));
  const intendedY = w0.y + (w2.y - w0.y) * frac;

  const radialXZ = Math.abs(Math.hypot(p.x - cx, p.z - cz) - r);
  const altErr = Math.abs(p.y - intendedY);
  return Math.hypot(radialXZ, altErr);
}

function frameError(frame: ModelState): number {
  const m = frame.mission as ModelState;
  const step = m.step as ModelState;
  const pos = frame.pos as Vec3;
  const isCturn = Math.round((step.stepType ?? 0) as number) === STEP_TYPE_CTURN;

  if (isCturn) {
    const wps = step.waypoints as Vec3[];
    if (!Array.isArray(wps) || wps.length < 3) return 0;
    return distToArc(pos, wps[0], wps[1], wps[2]);
  }
  return distPointToSegment(pos, m.segStart as Vec3, m.segEnd as Vec3);
}

interface Score { acc: number; mean: number; max: number; frames: number; lapSeconds: number }

function scoreRoute(history: ModelState[]): Score {
  let acc = 0;
  let max = 0;
  let frames = 0;
  let entered = false;

  for (const f of history) {
    const navigating = Math.round((f.mission as ModelState).phase as number) === NAVIGATE;
    if (navigating) {
      entered = true;
      const e = frameError(f);
      acc += e;
      if (e > max) max = e;
      frames++;
    } else if (entered) {
      break;
    }
  }

  return {
    acc,
    mean: frames ? acc / frames : 0,
    max,
    frames,
    lapSeconds: frames * SIM_DT,
  };
}

function runRoute(simId: string): ModelState[] {
  const config = quadPoleConfig({ simDuration: 1400, MAX_TICKS: 1400, REQUIRED_LAPS: 1 });
  initSim(simId, config);
  startSim(simId);
  const K = getStatic(simId).K as ModelState;
  vi.advanceTimersByTime(config.tickIntervalMs * ((K.simDuration as number) + 1));
  return getHistory(simId);
}

describe('quad-pole route', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tracks the route within error and time budgets', () => {
    const history = runRoute('pole-route');
    const s = scoreRoute(history);

    console.info(
      `[pole-route] lapSeconds=${s.lapSeconds.toFixed(2)} frames=${s.frames}` +
      ` max=${s.max.toFixed(2)} mean=${s.mean.toFixed(3)} acc=${s.acc.toFixed(1)}`,
    );

    expect(s.frames, 'too few NAVIGATE frames').toBeGreaterThan(100);
    expect(s.max, `max route error ${s.max.toFixed(2)} m`).toBeLessThan(8.0);
    expect(s.mean, `mean route error ${s.mean.toFixed(3)} m`).toBeLessThan(1.8);
    expect(s.acc, `accumulated route error ${s.acc.toFixed(1)} m`).toBeLessThan(800);
    expect(s.lapSeconds, `lap time ${s.lapSeconds.toFixed(2)} s`).toBeLessThanOrEqual(26.0);
  });
});
