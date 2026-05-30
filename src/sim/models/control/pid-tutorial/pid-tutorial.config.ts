import setpointCode from './blocks/setpoint.ts?raw';
import { setpoint } from './blocks/setpoint';
import controllerCode from './blocks/controller.ts?raw';
import { controller } from './blocks/controller';
import plantCode from './blocks/plant.ts?raw';
import { plant } from './blocks/plant';
import PidTutorialVis from './pid-tutorial.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

// Helpers for nested state access. ModelState leaves are number | null | ModelState,
// so narrowing assertions live in one place rather than scattered through mapStateIn.
const obj = (v: ModelState[string] | undefined): ModelState =>
  (typeof v === 'object' && v !== null && !Array.isArray(v)) ? v : {};
const num = (v: ModelState[string] | undefined, fb = 0): number =>
  typeof v === 'number' ? v : fb;
const numOrNull = (v: ModelState[string] | undefined): number | null =>
  typeof v === 'number' ? v : null;

const inputOf = (s: ModelState, blockId: string, field: string): number | null =>
  numOrNull(obj(obj(s.inputs)[blockId])[field]);

export const pidTutorialConfig: ModelConfig = {
  modelId: 'pid-tutorial',
  tickIntervalMs: 50,
  initialState: {
    setpoint: { signal_error: 0 },
    controller: { control: 0, integral: 0, prev_error: 0 },
    plant: { pos: 0, vel: 0, out: 0 },
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
  vis: PidTutorialVis,
  blocksDiagram: [
    { from: 'setpoint',   to: 'controller', label: 'error'   },
    { from: 'controller', to: 'plant',      label: 'control' },
    { from: 'plant',      to: 'setpoint',   label: 'output'  },
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
      label: 'Error and control',
      series: [
        { var: 'setpoint.signal_error', label: 'error',   color: '#ff8800' },
        { var: 'controller.control',    label: 'control', color: '#88dd44' },
      ],
    },
  ],
};
