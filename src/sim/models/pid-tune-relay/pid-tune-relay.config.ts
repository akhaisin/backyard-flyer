import setpointCode from './blocks/setpoint.ts?raw';
import { setpoint } from './blocks/setpoint';
import controllerCode from './blocks/controller.ts?raw';
import { controller } from './blocks/controller';
import plantCode from './blocks/plant.ts?raw';
import { plant } from './blocks/plant';
import tunerCode from './blocks/tuner.ts?raw';
import { tuner } from './blocks/tuner';
import PidTuneRelayVis from './pid-tune-relay.vis';
import type { ModelConfig, ModelState } from '../../engine/types';

const obj = (v: ModelState[string] | undefined): ModelState =>
  (typeof v === 'object' && v !== null) ? v : {};
const num = (v: ModelState[string] | undefined, fb = 0): number =>
  typeof v === 'number' ? v : fb;
const numOrNull = (v: ModelState[string] | undefined): number | null =>
  typeof v === 'number' ? v : null;

const inputOf = (s: ModelState, blockId: string, field: string): number | null =>
  numOrNull(obj(obj(s.inputs)[blockId])[field]);

const initialTuner: ModelState = {
  tuning: 0,
  relay_sign: 1,
  cycle_count: 0,
  last_cross_t: 0,
  start_t: 0,
  t: 0,
  period_sum: 0,
  amp_sum: 0,
  peak_high: 0,
  peak_low: 0,
  ku: 0,
  tu: 0,
  kp_new: 1.0,
  ki_new: 0.0,
  kd_new: 0.0,
  last_tune_signal: 0,
  control_out: 0,
};

export const pidTuneRelayConfig: ModelConfig = {
  modelId: 'pid-tune-relay',
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
      sourceId: 'controller',
      exportName: 'controller',
      defaultFn: (s) => controller(s as Parameters<typeof controller>[0]),
      defaultCode: controllerCode,
      inputs: { kp: 1.0, ki: 0.0, kd: 0.0 },
      mapStateIn: (s) => {
        const ctrl = obj(s.controller);
        return {
          kp: inputOf(s, 'controller', 'kp'),
          ki: inputOf(s, 'controller', 'ki'),
          kd: inputOf(s, 'controller', 'kd'),
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
      sourceId: 'tuner',
      exportName: 'tuner',
      defaultFn: (s) => tuner(s as Parameters<typeof tuner>[0]),
      defaultCode: tunerCode,
      // The vis writes Date.now() to this on each Tune Now click;
      // the block detects the change and begins a relay experiment.
      inputs: { tune_signal: 0 },
      mapStateIn: (s) => {
        const t = obj(s.tuner);
        return {
          y: num(obj(s.plant).out),
          control_in: num(obj(s.controller).control),
          target: num(inputOf(s, 'setpoint', 'target'), 1.0),
          tune_signal: num(inputOf(s, 'tuner', 'tune_signal'), 0),
          last_tune_signal: num(t.last_tune_signal, 0),
          tuning: num(t.tuning, 0),
          relay_sign: num(t.relay_sign, 1),
          cycle_count: num(t.cycle_count, 0),
          last_cross_t: num(t.last_cross_t, 0),
          start_t: num(t.start_t, 0),
          t: num(t.t, 0),
          period_sum: num(t.period_sum, 0),
          amp_sum: num(t.amp_sum, 0),
          peak_high: num(t.peak_high, 0),
          peak_low: num(t.peak_low, 0),
          ku: num(t.ku, 0),
          tu: num(t.tu, 0),
          kp_new: num(t.kp_new, 1.0),
          ki_new: num(t.ki_new, 0.0),
          kd_new: num(t.kd_new, 0.0),
        };
      },
      mapStateOut: (out, s) => {
        const prev = obj(s.tuner);
        const v = (key: string): number => {
          const o = out[key];
          if (typeof o === 'number') return o;
          const p = prev[key];
          return typeof p === 'number' ? p : 0;
        };
        return {
          ...s,
          tuner: {
            tuning: v('tuning'),
            relay_sign: v('relay_sign'),
            cycle_count: v('cycle_count'),
            last_cross_t: v('last_cross_t'),
            start_t: v('start_t'),
            t: v('t'),
            period_sum: v('period_sum'),
            amp_sum: v('amp_sum'),
            peak_high: v('peak_high'),
            peak_low: v('peak_low'),
            ku: v('ku'),
            tu: v('tu'),
            kp_new: v('kp_new'),
            ki_new: v('ki_new'),
            kd_new: v('kd_new'),
            last_tune_signal: v('last_tune_signal'),
            control_out: v('control_out'),
          },
        };
      },
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
          // Read control from the tuner — it's either a passthrough of the
          // PID output (idle) or the relay output (tuning).
          control: num(obj(s.tuner).control_out),
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
  vis: PidTuneRelayVis,
  charts: [
    {
      label: 'Target vs. output',
      series: [
        { var: 'inputs.setpoint.target', label: 'target', color: '#aaccff' },
        { var: 'plant.out',               label: 'output', color: '#4488ff' },
      ],
    },
    {
      label: 'Identified gains',
      series: [
        { var: 'tuner.kp_new', label: 'kp', color: '#ff8800' },
        { var: 'tuner.ki_new', label: 'ki', color: '#88dd44' },
        { var: 'tuner.kd_new', label: 'kd', color: '#ddcc44' },
      ],
    },
    {
      label: 'Ultimate (Ku, Tu)',
      series: [
        { var: 'tuner.ku', label: 'Ku',     color: '#cc66cc' },
        { var: 'tuner.tu', label: 'Tu (s)', color: '#66ccaa' },
      ],
    },
  ],
};
