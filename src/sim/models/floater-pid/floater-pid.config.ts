import missionPdCode from './blocks/mission_pd.ts?raw';
import { mission_pd } from './blocks/mission_pd';
import missionPidCode from './blocks/mission_pid.ts?raw';
import { mission_pid } from './blocks/mission_pid';
import fcPdCode from './blocks/fc_pd.ts?raw';
import { fc_pd } from './blocks/fc_pd';
import fcPidCode from './blocks/fc_pid.ts?raw';
import { fc_pid } from './blocks/fc_pid';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import windCode from './blocks/wind.ts?raw';
import { wind } from './blocks/wind';
import { createFloaterPidSceneHandler } from './floater-pid.scene';
import type { ModelConfig, ModelState } from '../../engine/types';

// Helpers for nested state access ------------------------------------------------
// Two vehicles live under `state.vehicles.v1` and `state.vehicles.v2`. Each block
// works on a single vehicle's sub-tree, so mapStateIn/Out pluck the right slice.

const vehicle = (s: ModelState, key: 'v1' | 'v2'): ModelState =>
  (s.vehicles as ModelState)[key] as ModelState;

const writeVehicle = (s: ModelState, key: 'v1' | 'v2', patch: ModelState): ModelState => ({
  ...s,
  vehicles: {
    ...(s.vehicles as ModelState),
    [key]: { ...vehicle(s, key), ...patch },
  },
});

const writeMission = (s: ModelState, key: 'v1' | 'v2', m: ModelState): ModelState => {
  const v = vehicle(s, key);
  return writeVehicle(s, key, { mission: { ...(v.mission as ModelState), ...m } });
};

const writeThrust = (s: ModelState, key: 'v1' | 'v2', t: ModelState): ModelState => {
  const v = vehicle(s, key);
  return writeVehicle(s, key, { thrust: { ...(v.thrust as ModelState), ...t } });
};

// Initial state ------------------------------------------------------------------

const vehicleInit = (): ModelState => ({
  pos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  acc: { x: 0, y: 0, z: 0 },
  thrust: {
    desired: { x: 0, y: 0, z: 0 },
    actual: { x: 0, y: 0, z: 0 },
  },
  mission: { targetIdx: 0, dist: 0, target: { x: 0, y: 0, z: 0 }, loops: 0 },
});

export const floaterPidConfig: ModelConfig = {
  modelId: 'floater-pid',
  tickIntervalMs: 50,
  initialState: {
    // Shared environment — both vehicles experience the same wind gust.
    // ticksLeft starts at 0 so a fresh gust is sampled on the first tick.
    wind: { fx: 0, fz: 0, ticksLeft: 0 },
    vehicles: {
      v1: vehicleInit(),
      // v2 carries integral accumulator + previous error for the PID controller
      v2: {
        ...vehicleInit(),
        err: { x: 0, y: 0, z: 0 },
        errPrev: { x: 0, y: 0, z: 0 },
      },
    },
  },
  blocks: [
    // --- Shared environment ---
    {
      sourceId: 'wind',
      exportName: 'wind',
      defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
      defaultCode: windCode,
      mapStateIn: (s) => s.wind as ModelState,
      mapStateOut: (out, s) => ({ ...s, wind: out }),
      tickFrequency: 1,
    },

    // --- Vehicle 1 (P-only) ---
    {
      sourceId: 'mission_pd',
      exportName: 'mission_pd',
      defaultFn: (s) => mission_pd(s as Parameters<typeof mission_pd>[0]),
      defaultCode: missionPdCode,
      mapStateIn: (s) => {
        const m = vehicle(s, 'v1').mission as ModelState;
        return { pos: vehicle(s, 'v1').pos, targetIdx: m.targetIdx, loops: m.loops };
      },
      mapStateOut: (out, s) => writeMission(s, 'v1', {
        targetIdx: out.targetIdx, dist: out.dist, target: out.target, loops: out.loops,
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_pd',
      exportName: 'fc_pd',
      defaultFn: (s) => fc_pd(s as Parameters<typeof fc_pd>[0]),
      defaultCode: fcPdCode,
      mapStateIn: (s) => {
        const v = vehicle(s, 'v1');
        return { pos: v.pos, vel: v.vel, target: (v.mission as ModelState).target };
      },
      mapStateOut: (out, s) => writeThrust(s, 'v1', { desired: out.desired }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_pd',
      exportName: 'hw',
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s) => {
        const t = (vehicle(s, 'v1').thrust as ModelState);
        return { desired: t.desired, actual: t.actual };
      },
      mapStateOut: (out, s) => writeThrust(s, 'v1', { actual: out.actual }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_pd',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => {
        const v = vehicle(s, 'v1');
        const w = s.wind as ModelState;
        return {
          pos: v.pos, vel: v.vel,
          actual: (v.thrust as ModelState).actual,
          windFx: w.fx, windFz: w.fz,
        };
      },
      mapStateOut: (out, s) => writeVehicle(s, 'v1', {
        pos: out.pos, vel: out.vel, acc: out.acc,
      }),
      tickFrequency: 1,
    },

    // --- Vehicle 2 (PID) ---
    {
      sourceId: 'mission_pid',
      exportName: 'mission_pid',
      defaultFn: (s) => mission_pid(s as Parameters<typeof mission_pid>[0]),
      defaultCode: missionPidCode,
      mapStateIn: (s) => {
        const m = vehicle(s, 'v2').mission as ModelState;
        return { pos: vehicle(s, 'v2').pos, targetIdx: m.targetIdx, loops: m.loops };
      },
      mapStateOut: (out, s) => writeMission(s, 'v2', {
        targetIdx: out.targetIdx, dist: out.dist, target: out.target, loops: out.loops,
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_pid',
      exportName: 'fc_pid',
      defaultFn: (s) => fc_pid(s as Parameters<typeof fc_pid>[0]),
      defaultCode: fcPidCode,
      mapStateIn: (s) => {
        const v = vehicle(s, 'v2');
        return {
          pos: v.pos, vel: v.vel,
          target: (v.mission as ModelState).target,
          err: v.err,
          errPrev: v.errPrev,
        };
      },
      mapStateOut: (out, s) => {
        const withThrust = writeThrust(s, 'v2', { desired: out.desired });
        return writeVehicle(withThrust, 'v2', { err: out.err, errPrev: out.errPrev });
      },
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_pid',
      exportName: 'hw',
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s) => {
        const t = (vehicle(s, 'v2').thrust as ModelState);
        return { desired: t.desired, actual: t.actual };
      },
      mapStateOut: (out, s) => writeThrust(s, 'v2', { actual: out.actual }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_pid',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => {
        const v = vehicle(s, 'v2');
        const w = s.wind as ModelState;
        return {
          pos: v.pos, vel: v.vel,
          actual: (v.thrust as ModelState).actual,
          windFx: w.fx, windFz: w.fz,
        };
      },
      mapStateOut: (out, s) => writeVehicle(s, 'v2', {
        pos: out.pos, vel: out.vel, acc: out.acc,
      }),
      tickFrequency: 1,
    },
  ],
  sceneHandler: createFloaterPidSceneHandler,
  charts: [
    {
      label: 'Y position — PD (blue) vs PID (orange)',
      series: [
        { var: 'vehicles.v1.pos.y',            label: 'PD  y',      color: '#4488ff' },
        { var: 'vehicles.v1.mission.target.y', label: 'PD  target', color: '#aaccff' },
        { var: 'vehicles.v2.pos.y',            label: 'PID y',      color: '#ff8800' },
        { var: 'vehicles.v2.mission.target.y', label: 'PID target', color: '#ffcc88' },
      ],
    },
    {
      label: 'Distance to target',
      series: [
        { var: 'vehicles.v1.mission.dist', label: 'PD',  color: '#4488ff' },
        { var: 'vehicles.v2.mission.dist', label: 'PID', color: '#ff8800' },
      ],
    },
    {
      label: 'Laps completed',
      series: [
        { var: 'vehicles.v1.mission.loops', label: 'PD',  color: '#4488ff' },
        { var: 'vehicles.v2.mission.loops', label: 'PID', color: '#ff8800' },
      ],
    },
    {
      label: 'Wind force (N)',
      series: [
        { var: 'wind.fx', label: 'wind fx', color: '#bbbbbb' },
        { var: 'wind.fz', label: 'wind fz', color: '#888888' },
      ],
    },
  ],
};
