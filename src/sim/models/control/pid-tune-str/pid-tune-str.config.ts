import setpointCode from './blocks/setpoint.ts?raw';
import { setpoint } from './blocks/setpoint';
import controllerCode from './blocks/controller.ts?raw';
import { controller } from './blocks/controller';
import plantCode from './blocks/plant.ts?raw';
import { plant } from './blocks/plant';
import tunerCode from './blocks/tuner.ts?raw';
import { tuner } from './blocks/tuner';
import PidTuneStrVis from './pid-tune-str.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const obj = (v: ModelState[string] | undefined): ModelState =>
  (typeof v === 'object' && v !== null) ? v : {};
const num = (v: ModelState[string] | undefined, fb = 0): number =>
  typeof v === 'number' ? v : fb;
const numOrNull = (v: ModelState[string] | undefined): number | null =>
  typeof v === 'number' ? v : null;

const inputOf = (s: ModelState, blockId: string, field: string): number | null =>
  numOrNull(obj(obj(s.inputs)[blockId])[field]);

// Initial tuner state: ARX coefficients seeded with the default plant model
// (m=1, β=0.5, dt=0.05). This gives RLS a sensible starting point so the
// first ticks don't generate wild m̂ estimates (b₁ near zero used to slam m̂
// against its clamp ceiling, which created an aggressive transient).
//
// Covariance is still large (1000·I) so RLS will move freely toward the
// real plant if it differs from the default.
const INITIAL_P = 1000;
const A1_INIT = 2 - 0.5 * 0.05 / 1;      // = 1.975
const A2_INIT = -(1 - 0.5 * 0.05 / 1);   // = -0.975
const B1_INIT = (0.05 * 0.05) / 1;       // = 0.0025
const initialTuner: ModelState = {
  a1: A1_INIT, a2: A2_INIT, b1: B1_INIT,
  p00: INITIAL_P, p01: 0,         p02: 0,
  p10: 0,         p11: INITIAL_P, p12: 0,
  p20: 0,         p21: 0,         p22: INITIAL_P,
  y_lag1: 0, y_lag2: 0, u_lag1: 0,
  m_hat: 1.0, beta_hat: 0.5,
  kp_str: 3.0, ki_str: 1.0, kd_str: 2.5,
  kp: 3.0, ki: 1.0, kd: 2.5,
  // Re-tune edge detector: block compares incoming `retune_signal` to this
  // stored value; any change forces a covariance reset.
  last_retune_signal: 0,
};

export const pidTuneStrConfig: ModelConfig = {
  modelId: 'pid-tune-str',
  tickIntervalMs: 50,
  initialState: {
    setpoint: { signal_error: 0 },
    controller: { control: 0, integral: 0, prev_error: 0 },
    plant: { pos: 0, vel: 0, out: 0 },
    tuner: initialTuner,
  },
  blocks: [
    {
      sourceId: 'setpoint',
      exportName: 'setpoint',
      defaultFn: (s) => setpoint(s as Parameters<typeof setpoint>[0]),
      defaultCode: setpointCode,
      inputs: { target: 1.0 },
      mapStateIn: (s) => ({
        target: inputOf(s, 'setpoint', 'target'),
        plant_out: num(obj(s.plant).out),
      }),
      mapStateOut: (out, s) => ({ ...s, setpoint: { signal_error: num(out.signal_error) } }),
      tickFrequency: 1,
    },
    {
      sourceId: 'tuner',
      exportName: 'tuner',
      defaultFn: (s) => tuner(s as Parameters<typeof tuner>[0]),
      defaultCode: tunerCode,
      // `enabled` is a 0/1 flag (AUTO/MANUAL switch).
      // `retune_signal` is an arbitrary value (timestamp from the vis) — any
      // change from the block's `last_retune_signal` triggers a covariance
      // reset, which lets RLS adapt aggressively from current data.
      inputs: { enabled: 1.0, retune_signal: 0 },
      mapStateIn: (s) => {
        const t = obj(s.tuner);
        const p = obj(s.plant);
        const c = obj(s.controller);
        const ci = obj(obj(s.inputs).controller);
        return {
          y: num(p.out),
          u: num(c.control),
          enabled: num(inputOf(s, 'tuner', 'enabled'), 1.0),
          retune_signal: num(inputOf(s, 'tuner', 'retune_signal'), 0),
          last_retune_signal: num(t.last_retune_signal, 0),
          kp_manual: num(ci.kp, 3.0),
          ki_manual: num(ci.ki, 1.0),
          kd_manual: num(ci.kd, 2.5),
          a1: num(t.a1), a2: num(t.a2), b1: num(t.b1),
          p00: num(t.p00), p01: num(t.p01), p02: num(t.p02),
          p10: num(t.p10), p11: num(t.p11), p12: num(t.p12),
          p20: num(t.p20), p21: num(t.p21), p22: num(t.p22),
          y_lag1: num(t.y_lag1), y_lag2: num(t.y_lag2), u_lag1: num(t.u_lag1),
          m_hat: num(t.m_hat, 1.0), beta_hat: num(t.beta_hat, 0.5),
          kp_str: num(t.kp_str, 3.0), ki_str: num(t.ki_str, 1.0), kd_str: num(t.kd_str, 2.5),
          kp: num(t.kp, 3.0), ki: num(t.ki, 1.0), kd: num(t.kd, 2.5),
        };
      },
      mapStateOut: (out, s) => {
        // If a user-edited tuner returns a partial object (missing some
        // fields), keep the previous value instead of clobbering to 0.
        const prev = obj(s.tuner);
        const v = (key: string): number => {
          const o = out[key];
          if (typeof o === 'number') return o;
          const p = prev[key];
          return typeof p === 'number' ? p : 0;
        };
        // STR-gain derivation, used as a fallback if the block didn't return
        // kp_str / ki_str / kd_str (e.g., older staged version of the block
        // didn't expose them). Mirrors the pole-placement rule from
        // tuner.ts so readouts stay live regardless of block staleness.
        const OMEGA_FALLBACK = 1.0;
        const mH = v('m_hat');
        const bH = v('beta_hat');
        const kp_str_fb = 3 * mH * OMEGA_FALLBACK * OMEGA_FALLBACK;
        const ki_str_fb = mH * OMEGA_FALLBACK * OMEGA_FALLBACK * OMEGA_FALLBACK;
        const kd_str_fb = Math.max(0, 3 * mH * OMEGA_FALLBACK - bH);
        return {
          ...s,
          tuner: {
            a1: v('a1'), a2: v('a2'), b1: v('b1'),
            p00: v('p00'), p01: v('p01'), p02: v('p02'),
            p10: v('p10'), p11: v('p11'), p12: v('p12'),
            p20: v('p20'), p21: v('p21'), p22: v('p22'),
            y_lag1: v('y_lag1'), y_lag2: v('y_lag2'), u_lag1: v('u_lag1'),
            m_hat: mH, beta_hat: bH,
            kp_str: typeof out.kp_str === 'number' ? out.kp_str : kp_str_fb,
            ki_str: typeof out.ki_str === 'number' ? out.ki_str : ki_str_fb,
            kd_str: typeof out.kd_str === 'number' ? out.kd_str : kd_str_fb,
            kp: v('kp'), ki: v('ki'), kd: v('kd'),
            last_retune_signal: v('last_retune_signal'),
          },
        };
      },
      tickFrequency: 1,
    },
    {
      sourceId: 'controller',
      exportName: 'controller',
      defaultFn: (s) => controller(s as Parameters<typeof controller>[0]),
      defaultCode: controllerCode,
      // Manual gains live here. Tuner reads them and decides whether to apply
      // them (MANUAL mode) or override with STR-derived values (AUTO mode).
      inputs: { kp: 3.0, ki: 1.0, kd: 2.5 },
      mapStateIn: (s) => {
        const ctrl = obj(s.controller);
        const t = obj(s.tuner);
        return {
          kp: num(t.kp, 1.0),
          ki: num(t.ki, 0.0),
          kd: num(t.kd, 0.0),
          error: num(obj(s.setpoint).signal_error),
          integral: num(ctrl.integral),
          prev_error: num(ctrl.prev_error),
        };
      },
      mapStateOut: (out, s) => ({
        ...s,
        controller: {
          control: num(out.control),
          integral: num(out.integral),
          prev_error: num(out.prev_error),
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'plant',
      exportName: 'plant',
      defaultFn: (s) => plant(s as Parameters<typeof plant>[0]),
      defaultCode: plantCode,
      inputs: { mass: 1.0, damping: 0.5 },
      mapStateIn: (s) => {
        const p = obj(s.plant);
        return {
          mass: inputOf(s, 'plant', 'mass'),
          damping: inputOf(s, 'plant', 'damping'),
          control: num(obj(s.controller).control),
          pos: num(p.pos),
          vel: num(p.vel),
        };
      },
      mapStateOut: (out, s) => ({
        ...s,
        plant: { pos: num(out.pos), vel: num(out.vel), out: num(out.out) },
      }),
      tickFrequency: 1,
    },
  ],
  vis: PidTuneStrVis,
  blocksDiagram: [
    { from: 'setpoint',   to: 'controller', label: 'error'   },
    { from: 'tuner',      to: 'controller', label: 'gains'   },
    { from: 'controller', to: 'plant',      label: 'control' },
    { from: 'plant',      to: 'setpoint',   label: 'output'  },
    { from: 'plant',      to: 'tuner',      label: 'y'       },
    { from: 'controller', to: 'tuner',      label: 'u'       },
  ],
  charts: [
    {
      label: 'Target vs. output',
      series: [
        { var: 'inputs.setpoint.target', label: 'target', color: '#aaccff' },
        { var: 'plant.out',               label: 'output', color: '#4488ff' },
      ],
    },
    {
      label: 'Identified plant (true vs. estimated)',
      series: [
        { var: 'inputs.plant.mass',    label: 'mass (true)',    color: '#aaccff' },
        { var: 'tuner.m_hat',          label: 'mass (est.)',    color: '#4488ff' },
        { var: 'inputs.plant.damping', label: 'damping (true)', color: '#ffcc88' },
        { var: 'tuner.beta_hat',       label: 'damping (est.)', color: '#ff8800' },
      ],
    },
    {
      label: 'Tuned gains (STR)',
      series: [
        { var: 'tuner.kp', label: 'kp', color: '#ff8800' },
        { var: 'tuner.ki', label: 'ki', color: '#88dd44' },
        { var: 'tuner.kd', label: 'kd', color: '#ddcc44' },
      ],
    },
  ],
};
