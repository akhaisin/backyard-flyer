import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSim, startSim, getState, getStatic, getTick } from '../../../engine/engine';
import { quadNoiseConfig } from './quad-noise.config';
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS, STEP_TYPE_WP } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';
import type { WpStep, QuadConsts } from '../../lib/quad/consts';

// Block Three.js / WebGL imports that fail in jsdom.
vi.mock('./quad-noise.vis', () => ({ default: () => null }));

// Seeded LCG so Math.random() is deterministic per test — wind/noise blocks use
// Math.random and would otherwise make results non-reproducible.
function makeSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

// 10-waypoint zigzag route with altitude variation (y: 3–8 m).
// Leg lengths: 8–10 m in 3D; perimeter ~83 m/lap (vs 32 m for the default 4-wp square).
const ROUTE_10WP: WpStep[] = [
  { type: STEP_TYPE_WP, pos: { x: 0, y: 4, z:  0 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 8, y: 6, z:  0 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 8, y: 8, z:  8 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 0, y: 6, z:  8 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 0, y: 4, z: 16 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 8, y: 7, z: 16 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 8, y: 5, z:  8 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 0, y: 7, z:  4 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 4, y: 3, z: 12 }, threshold: 1.2 },
  { type: STEP_TYPE_WP, pos: { x: 4, y: 6, z:  4 }, threshold: 1.2 },
];

// Acceptance criteria scaled for the 10-wp route under noise + wind.
// Calibrated from a clean run: completionTick ≈ 2000, completionAccErr ≈ 2700.
const CRITERIA_10WP: Partial<QuadConsts> = {
  REQUIRED_LAPS: 3,
  MAX_TICKS:     2700,   // ~35 % headroom over clean-run completionTick
  ACC_ERR_LIMIT: 4000,   // ~50 % headroom over clean-run completionAccErr
  simDuration:   4000,   // hard cap; 2× expected completion time
};

// Build a model config that uses the production blocks from quadNoiseConfig but
// overrides the lifecycle block with a custom route + acceptance criteria.
function makeFixtureConfig(route: WpStep[], criteria: Partial<QuadConsts>) {
  const config = quadNoiseConfig();
  const idx = config.blocks.findIndex(b => b.sourceId === 'lifecycle');
  config.blocks[idx] = makeLifecycleBlock(QUAD_DEFAULTS, route, criteria);
  return config;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function runSimToCompletion(simId: string, config: ReturnType<typeof quadNoiseConfig>): void {
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
    `completionAccErr=${Number(v.completionAccErr).toFixed(0)}, tick=${getTick(simId)}`;
  expect(v.pass, msg).toBe(1);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('quad-noise sim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockImplementation(makeSeededRandom(42));
  });
  afterEach(() => vi.useRealTimers());

  it('passes all criteria with default config (4-wp square, ACC_ERR_LIMIT 1500)', () => {
    const simId = 'quad-noise-default';
    runSimToCompletion(simId, quadNoiseConfig());
    assertPass(simId);
  });

  it('passes all criteria with fixture config (10-wp zigzag, altitude variation)', () => {
    const simId = 'quad-noise-10wp';
    runSimToCompletion(simId, makeFixtureConfig(ROUTE_10WP, CRITERIA_10WP));
    assertPass(simId);
  });
});
