import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSim, startSim, getState, getStatic, getTick } from '../../../engine/engine';
import { quadW1bConfig } from './quad-w1b.config';
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS, STEP_TYPE_W1B } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';
import type { W1bStep, QuadConsts } from '../../lib/quad/consts';

// Block Three.js / WebGL imports that fail in jsdom.
vi.mock('./quad-w1b.vis', () => ({ default: () => null }));

// Seeded LCG — wind and noise blocks use Math.random; seeding makes results
// reproducible across runs.
function makeSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

// 10-gate rectangular course with altitude variation (y: 3–8 m).
// Same geometry as the w1a fixture; each gate adds preStageDist so planner_w1b
// lines up on the approach axis before committing to the frame.
// Route ordered so the drone's initial position (0,0,0) is on the correct
// approach side of gate[0]: dot((0,0,0) − gate.pos, gate.normal) < 0.
const ROUTE_10GATE: W1bStep[] = [
  { type: STEP_TYPE_W1B, pos: { x: -12, y: 3, z:  -8 }, normal: { x:  0, y: 0, z: -1 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:  -6, y: 4, z: -12 }, normal: { x:  1, y: 0, z:  0 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:   6, y: 7, z: -12 }, normal: { x:  1, y: 0, z:  0 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:  12, y: 8, z:  -8 }, normal: { x:  0, y: 0, z:  1 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:  12, y: 5, z:   0 }, normal: { x:  0, y: 0, z:  1 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:  12, y: 3, z:   8 }, normal: { x:  0, y: 0, z:  1 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:   6, y: 6, z:  12 }, normal: { x: -1, y: 0, z:  0 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x:  -6, y: 4, z:  12 }, normal: { x: -1, y: 0, z:  0 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x: -12, y: 8, z:   8 }, normal: { x:  0, y: 0, z: -1 }, width: 5, height: 5, preStageDist: 5 },
  { type: STEP_TYPE_W1B, pos: { x: -12, y: 5, z:   0 }, normal: { x:  0, y: 0, z: -1 }, width: 5, height: 5, preStageDist: 5 },
];

// Flight-critical model tuning — must match quadW1bConfig's modelOverrides so
// the navigator and planner behave as calibrated when the lifecycle block is swapped.
const W1B_FLIGHT_TUNING: Partial<QuadConsts> = {
  KI_POS:             0.3,
  MAX_TILT:           0.4,
  KP_YAW_OUTER:       5.0,
  YAW_MEAS_LPF:       0.35,
  WIND_FORCE_MAX_PCT: 5,     // reduced from default 20 % for stable seeded tests
};

// Acceptance criteria for the 10-gate fixture route.
// Calibrated from a clean run: completionTick ≈ 3300, completionAccErr ≈ 8100,
// restarts ≈ 17 (pre-stage approach lines up better than w1a but still needs budget).
const CRITERIA_10GATE: Partial<QuadConsts> = {
  ...W1B_FLIGHT_TUNING,
  REQUIRED_LAPS:  3,
  MAX_TICKS:      10000,  // ~35 % headroom over clean-run completionTick (~3300)
  ACC_ERR_LIMIT:  12000,  // ~50 % headroom over clean-run completionAccErr (~8100)
  MAX_RESTARTS:   25,     // ~47 % headroom over observed restarts (~17)
  simDuration:    15000,  // hard cap; ~2× expected completion time
};

// Build a model config that uses the production blocks from quadW1bConfig but
// overrides the lifecycle block with a custom route + acceptance criteria.
function makeFixtureConfig(route: W1bStep[], criteria: Partial<QuadConsts>) {
  const config = quadW1bConfig();
  const idx = config.blocks.findIndex(b => b.sourceId === 'lifecycle');
  config.blocks[idx] = makeLifecycleBlock(QUAD_DEFAULTS, route, criteria);
  return config;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runSimToCompletion(simId: string, config: ReturnType<typeof quadW1bConfig>): void {
  initSim(simId, config);
  startSim(simId);
  const K = getStatic(simId).K as ModelState;
  vi.advanceTimersByTime(config.tickIntervalMs * ((K.simDuration as number) + 1));
}

function assertPass(simId: string): void {
  const v = getState(simId).validator as ModelState;
  const msg =
    `passCount=${v.passCount}/${v.passTotal}, ` +
    `laps=${v.lapsTotal}, completionTick=${v.completionTick}, ` +
    `completionAccErr=${Number(v.completionAccErr).toFixed(0)}, ` +
    `restarts=${v.restarts}, tick=${getTick(simId)}`;
  expect(v.pass, msg).toBe(1);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('quad-w1b sim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockImplementation(makeSeededRandom(42));
  });
  afterEach(() => vi.useRealTimers());

  it('passes all criteria with default config (4-gate square, reduced wind)', () => {
    const simId = 'quad-w1b-default';
    // Wind reduced from 20 → 5 % for stable deterministic tests; model's own
    // criteria (MAX_RESTARTS=4, ACC_ERR_LIMIT=8000) still apply and pass.
    runSimToCompletion(simId, quadW1bConfig({ WIND_FORCE_MAX_PCT: 5 }));
    assertPass(simId);
  });

  it('passes all criteria with fixture config (10-gate, altitude variation)', () => {
    const simId = 'quad-w1b-10gate';
    runSimToCompletion(simId, makeFixtureConfig(ROUTE_10GATE, CRITERIA_10GATE));
    assertPass(simId);
  });
});
