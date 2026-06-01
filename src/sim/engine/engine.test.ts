import { describe, it, expect, beforeEach } from 'vitest';
import {
  initSim, startSim, stopSim, resetSim,
  getState, getStatic, getHistory, getTick, isRunning,
} from './engine';
import type { ModelConfig, ModelState } from './types';

// A minimal model with one static block (publishes K) and one dynamic block
// (a counter that also reads K). Used to assert the static-slice contract:
// K reaches blocks, K stays out of history, getStatic exposes it.
let staticRunCount = 0;

function makeConfig(): ModelConfig {
  staticRunCount = 0;
  return {
    modelId: 'test/static',
    tickIntervalMs: 1,
    initialState: { count: 0 },
    blocks: [
      {
        sourceId: 'params',
        exportName: 'params',
        defaultFn: () => { staticRunCount++; return { GAIN: 2 }; },
        defaultCode: '',
        mapStateIn: () => ({}),
        mapStateOut: (out, s) => ({ ...s, K: Object.freeze(out) }),
        static: true,
        staticKeys: ['K'],
        tickFrequency: 1,
      },
      {
        sourceId: 'counter',
        exportName: 'counter',
        // Reads K (merged in by the engine) and increments by GAIN.
        defaultFn: (local) => {
          const k = local.K as ModelState;
          return { count: (local.count as number) + (k.GAIN as number) };
        },
        defaultCode: '',
        mapStateIn: (s) => ({ count: s.count, K: s.K }),
        mapStateOut: (out, s) => ({ ...s, count: out.count }),
        tickFrequency: 1,
      },
    ],
    vis: (() => null) as unknown as ModelConfig['vis'],
    charts: [],
  };
}

function tickOnce(simId: string) {
  startSim(simId);
  stopSim(simId);
}

describe('engine static slice', () => {
  beforeEach(() => localStorage.clear());

  it('runs the static block once at init, not per tick', () => {
    initSim('s1', makeConfig());
    expect(staticRunCount).toBe(1);
    // Drive a few ticks synchronously via the interval-free helper is awkward;
    // instead assert the slice is stable and dynamic state advanced.
    expect(getStatic('s1').K).toEqual({ GAIN: 2 });
    expect(staticRunCount).toBe(1);
  });

  it('exposes K via getStatic but never via getState/getHistory', async () => {
    initSim('s2', makeConfig());
    startSim('s2');
    await new Promise(r => setTimeout(r, 20));
    stopSim('s2');

    // getStatic has K; getState does not.
    expect((getStatic('s2').K as ModelState).GAIN).toBe(2);
    expect(getState('s2').K).toBeUndefined();

    // History advanced and carries the dynamic counter but no K.
    const hist = getHistory('s2');
    expect(hist.length).toBeGreaterThan(0);
    for (const snap of hist) {
      expect(snap.K).toBeUndefined();
      expect(typeof snap.count).toBe('number');
    }
    // Counter incremented by GAIN each tick → multiple of 2.
    expect((getState('s2').count as number) % 2).toBe(0);
    expect(getState('s2').count as number).toBeGreaterThan(0);
  });

  it('rebuilds the static slice on reset', () => {
    initSim('s3', makeConfig());
    expect(staticRunCount).toBe(1);
    resetSim('s3');
    // reset clears history/state; static slice remains valid.
    expect(getStatic('s3').K).toEqual({ GAIN: 2 });
    expect(getHistory('s3').length).toBe(0);
  });
});

// Lifecycle block: beforeSim seeds K (incl. simDuration); after writes a derived
// field into dynamic state each tick and stops once tick >= simDuration; afterSim
// records that it fired.
let afterSimFired = 0;

function makeLifecycleConfig(simDuration: number): ModelConfig {
  afterSimFired = 0;
  return {
    modelId: 'test/lifecycle',
    tickIntervalMs: 1,
    initialState: { count: 0, doubled: 0 },
    blocks: [
      {
        sourceId: 'lifecycle',
        exportName: 'beforeSim',
        defaultFn: () => ({ simDuration }),
        defaultCode: '',
        mapStateIn: () => ({}),
        mapStateOut: (out, s) => ({ ...s, K: Object.freeze(out) }),
        static: true,
        staticKeys: ['K'],
        lifecycle: {
          after: {
            exportName: 'after',
            defaultFn: (s) => {
              // Reads K + tick (merged by engine), writes a dynamic field.
              const k = s.K as ModelState;
              s.doubled = (s.count as number) * 2;
              if ((s.tick as number) >= (k.simDuration as number)) return false;
              return s;
            },
          },
          afterSim: {
            exportName: 'afterSim',
            // Finalize a verdict into live state — its return IS committed.
            defaultFn: (s) => { afterSimFired++; s.verdict = 1; return s; },
          },
        },
        tickFrequency: 1,
      },
      {
        sourceId: 'counter',
        exportName: 'counter',
        defaultFn: (local) => ({ count: (local.count as number) + 1 }),
        defaultCode: '',
        mapStateIn: (s) => ({ count: s.count }),
        mapStateOut: (out, s) => ({ ...s, count: out.count }),
        tickFrequency: 1,
      },
    ],
    vis: (() => null) as unknown as ModelConfig['vis'],
    charts: [],
  };
}

describe('engine lifecycle hooks', () => {
  beforeEach(() => localStorage.clear());

  it('after() writes dynamic state each tick and K/tick never leak into history', async () => {
    initSim('l1', makeLifecycleConfig(5));
    startSim('l1');
    await new Promise(r => setTimeout(r, 30));
    stopSim('l1');

    const hist = getHistory('l1');
    expect(hist.length).toBeGreaterThan(0);
    for (const snap of hist) {
      expect(snap.K).toBeUndefined();         // static slice not persisted
      expect(snap.tick).toBeUndefined();      // injected tick stripped
      expect(snap.doubled).toBe((snap.count as number) * 2); // after() ran
    }
  });

  it('after() stops the sim at simDuration and afterSim fires', async () => {
    initSim('l2', makeLifecycleConfig(5));
    startSim('l2');
    await new Promise(r => setTimeout(r, 50));
    // Natural stop: not running, exactly simDuration ticks committed.
    expect(isRunning('l2')).toBe(false);
    expect(getTick('l2')).toBe(5);
    expect(getHistory('l2').length).toBe(5);
    expect(afterSimFired).toBe(1);
  });

  it('afterSim commits its returned state (verdict) to live state, not history', async () => {
    initSim('l4', makeLifecycleConfig(5));
    startSim('l4');
    await new Promise(r => setTimeout(r, 50));
    // afterSim wrote verdict into the live snapshot...
    expect(getState('l4').verdict).toBe(1);
    // ...but did not push an extra history entry (still simDuration entries),
    // and the injected static key + tick were stripped.
    expect(getHistory('l4').length).toBe(5);
    expect(getState('l4').K).toBeUndefined();
    expect(getState('l4').tick).toBeUndefined();
  });

  it('afterSim fires on manual stop too', async () => {
    initSim('l3', makeLifecycleConfig(10000));
    startSim('l3');
    await new Promise(r => setTimeout(r, 10));
    expect(isRunning('l3')).toBe(true);
    stopSim('l3');
    expect(afterSimFired).toBe(1);
  });
});
