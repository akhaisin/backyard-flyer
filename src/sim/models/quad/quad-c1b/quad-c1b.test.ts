import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSim, startSim, getState, getStatic, getTick } from '../../../engine/engine';
import { quadC1bConfig } from './quad-c1b.config';
import type { ModelState } from '../../../engine/types';

vi.mock('./quad-c1b.vis', () => ({ default: () => null }));

function makeSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function runSimToCompletion(simId: string, config: ReturnType<typeof quadC1bConfig>): void {
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
    `restarts=${v.restarts}, tick=${getTick(simId)}`;
  expect(v.pass, msg).toBe(1);
}

describe('quad-c1b sim', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockImplementation(makeSeededRandom(42));
  });
  afterEach(() => vi.useRealTimers());

  it('completes 2 pre-staged intercept rounds within the default budget', () => {
    const simId = 'quad-c1b-default';
    runSimToCompletion(simId, quadC1bConfig());
    assertPass(simId);
  });
});
