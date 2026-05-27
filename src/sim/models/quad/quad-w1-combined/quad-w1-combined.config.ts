import windCode from './blocks/wind.ts?raw';
import { wind } from './blocks/wind';
import noiseCode from './blocks/noise.ts?raw';
import { noise } from './blocks/noise';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import fcStabilizerCode from './blocks/fc_stabilizer.ts?raw';
import { fc_stabilizer } from './blocks/fc_stabilizer';
import fcNavigatorCode from './blocks/fc_navigator.ts?raw';
import { fc_navigator } from './blocks/fc_navigator';
import missionACode from './blocks/mission_a.ts?raw';
import { mission_a } from './blocks/mission_a';
import missionBCode from './blocks/mission_b.ts?raw';
import { mission_b } from './blocks/mission_b';
import fcPathPlannerACode from './blocks/fc_path_planner_a.ts?raw';
import { fc_path_planner as fc_path_planner_a } from './blocks/fc_path_planner_a';
import fcPathPlannerBCode from './blocks/fc_path_planner_b.ts?raw';
import { fc_path_planner as fc_path_planner_b } from './blocks/fc_path_planner_b';
import QuadW1CombinedVis from './quad-w1-combined.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

// ── State helpers ────────────────────────────────────────────────────────────

const va = (s: ModelState): ModelState =>
  ((s.vehicles as ModelState).a as ModelState);

const vb = (s: ModelState): ModelState =>
  ((s.vehicles as ModelState).b as ModelState);

const writeVehicle = (s: ModelState, key: 'a' | 'b', patch: ModelState): ModelState => ({
  ...s,
  vehicles: { ...(s.vehicles as ModelState), [key]: { ...((s.vehicles as ModelState)[key] as ModelState), ...patch } },
});

// ── Initial vehicle state ────────────────────────────────────────────────────

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

const vehicleInit = (startX: number, startZ: number): ModelState => ({
  pos:        { x: startX, y: 0, z: startZ },
  vel:        { ...vec0 },
  acc:        { ...vec0 },
  attitude:   { ...vec0 },
  angularVel: { ...vec0 },
  sensors: {
    pos:        { x: startX, y: 0, z: startZ },
    vel:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
  },
  fc: {
    nav:      { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0 },
    integral: { pos: { ...vec0 }, att: { ...vec0 } },
  },
  motors: {
    desired: { ...motors0 },
    thrust:  { ...motors0 },
  },
  mission: {
    phase:        0,
    windowIdx:    0,
    ticksInPhase: 0,
    armed:        0,
    windowSide:   0,
    windowCenter: { ...vec0 },
    windowNormal: { x: 1, y: 0, z: 0 },
    dist:         0,
    loops:        0,
  },
  planner: {
    carrot:          { ...vec0 },
    preGateDone:     0,
    activeWindowIdx: -1,
  },
});

// ── Config ───────────────────────────────────────────────────────────────────

export const quadW1CombinedConfig: ModelConfig = {
  modelId: 'quad/quad-w1-combined',
  tickIntervalMs: 50,
  initialState: {
    wind: { fx: 0, fz: 0, ticksLeft: 0 },
    vehicles: {
      a: vehicleInit(-15,  15),  // track A — -x/+z quadrant
      b: vehicleInit( 15, -15),  // track B — +x/-z quadrant
    },
  },
  blocks: [
    // ── Shared environment ──────────────────────────────────────────────────
    {
      sourceId: 'wind',
      exportName: 'wind',
      defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
      defaultCode: windCode,
      mapStateIn:  (s) => s.wind as ModelState,
      mapStateOut: (out, s) => ({ ...s, wind: out }),
      tickFrequency: 1,
    },

    // ── Vehicle A (w1a — carrot-and-stick) ──────────────────────────────────
    {
      sourceId: 'noise_a',
      exportName: 'noise',
      defaultFn: (s) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn:  (s) => ({ pos: va(s).pos, vel: va(s).vel, attitude: va(s).attitude, angularVel: va(s).angularVel }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', { sensors: out }),
      tickFrequency: 1,
    },
    {
      sourceId: 'mission_a',
      exportName: 'mission_a',
      defaultFn: (s) => mission_a(s as Parameters<typeof mission_a>[0]),
      defaultCode: missionACode,
      mapStateIn: (s) => ({
        pos:          (va(s).sensors as ModelState).pos,
        phase:        (va(s).mission as ModelState).phase,
        windowIdx:    (va(s).mission as ModelState).windowIdx,
        ticksInPhase: (va(s).mission as ModelState).ticksInPhase,
        armed:        (va(s).mission as ModelState).armed,
        windowSide:   (va(s).mission as ModelState).windowSide,
        loops:        (va(s).mission as ModelState).loops,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        mission: {
          ...(va(s).mission as ModelState),
          phase: out.phase, windowIdx: out.windowIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, windowSide: out.windowSide, windowCenter: out.windowCenter,
          windowNormal: out.windowNormal, dist: out.dist, loops: out.loops,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_path_planner_a',
      exportName: 'fc_path_planner',
      defaultFn: (s) => fc_path_planner_a(s as Parameters<typeof fc_path_planner_a>[0]),
      defaultCode: fcPathPlannerACode,
      mapStateIn: (s) => ({
        pos:          (va(s).sensors as ModelState).pos,
        windowCenter: (va(s).mission as ModelState).windowCenter,
        windowNormal: (va(s).mission as ModelState).windowNormal,
        armed:        (va(s).mission as ModelState).armed,
        phase:        (va(s).mission as ModelState).phase,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', { planner: { carrot: out.carrot } }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_navigator_a',
      exportName: 'fc_navigator',
      defaultFn: (s) => fc_navigator(s as Parameters<typeof fc_navigator>[0]),
      defaultCode: fcNavigatorCode,
      mapStateIn: (s) => ({
        pos:         (va(s).sensors as ModelState).pos,
        vel:         (va(s).sensors as ModelState).vel,
        attitude:    (va(s).sensors as ModelState).attitude,
        carrot:      (va(s).planner as ModelState).carrot,
        armed:       (va(s).mission as ModelState).armed,
        integralPos: ((va(s).fc as ModelState).integral as ModelState).pos,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        fc: {
          ...(va(s).fc as ModelState),
          nav: { roll_des: out.roll_des, pitch_des: out.pitch_des, yaw_des: out.yaw_des, thrust: out.thrust },
          integral: { ...((va(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_stabilizer_a',
      exportName: 'fc_stabilizer',
      defaultFn: (s) => fc_stabilizer(s as Parameters<typeof fc_stabilizer>[0]),
      defaultCode: fcStabilizerCode,
      mapStateIn: (s) => ({
        attitude:    (va(s).sensors as ModelState).attitude,
        angularVel:  (va(s).sensors as ModelState).angularVel,
        roll_des:    ((va(s).fc as ModelState).nav as ModelState).roll_des,
        pitch_des:   ((va(s).fc as ModelState).nav as ModelState).pitch_des,
        yaw_des:     ((va(s).fc as ModelState).nav as ModelState).yaw_des,
        thrust:      ((va(s).fc as ModelState).nav as ModelState).thrust,
        armed:       (va(s).mission as ModelState).armed,
        integralAtt: ((va(s).fc as ModelState).integral as ModelState).att,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        fc: {
          ...(va(s).fc as ModelState),
          integral: { ...((va(s).fc as ModelState).integral as ModelState), att: out.integralAtt },
        },
        motors: { ...(va(s).motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_a',
      exportName: 'hw',
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s) => ({
        motors:     (va(s).motors as ModelState).desired,
        thrustPrev: (va(s).motors as ModelState).thrust,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        motors: { ...(va(s).motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_a',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => ({
        pos: va(s).pos, vel: va(s).vel, attitude: va(s).attitude, angularVel: va(s).angularVel,
        thrust: (va(s).motors as ModelState).thrust,
        windFx: (s.wind as ModelState).fx,
        windFz: (s.wind as ModelState).fz,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        pos: out.pos, vel: out.vel, acc: out.acc, attitude: out.attitude, angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },

    // ── Vehicle B (w1b — pre-gate staging) ─────────────────────────────────
    {
      sourceId: 'noise_b',
      exportName: 'noise',
      defaultFn: (s) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn:  (s) => ({ pos: vb(s).pos, vel: vb(s).vel, attitude: vb(s).attitude, angularVel: vb(s).angularVel }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', { sensors: out }),
      tickFrequency: 1,
    },
    {
      sourceId: 'mission_b',
      exportName: 'mission_b',
      defaultFn: (s) => mission_b(s as Parameters<typeof mission_b>[0]),
      defaultCode: missionBCode,
      mapStateIn: (s) => ({
        pos:          (vb(s).sensors as ModelState).pos,
        phase:        (vb(s).mission as ModelState).phase,
        windowIdx:    (vb(s).mission as ModelState).windowIdx,
        ticksInPhase: (vb(s).mission as ModelState).ticksInPhase,
        armed:        (vb(s).mission as ModelState).armed,
        windowSide:   (vb(s).mission as ModelState).windowSide,
        loops:        (vb(s).mission as ModelState).loops,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        mission: {
          ...(vb(s).mission as ModelState),
          phase: out.phase, windowIdx: out.windowIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, windowSide: out.windowSide, windowCenter: out.windowCenter,
          windowNormal: out.windowNormal, dist: out.dist, loops: out.loops,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_path_planner_b',
      exportName: 'fc_path_planner',
      defaultFn: (s) => fc_path_planner_b(s as Parameters<typeof fc_path_planner_b>[0]),
      defaultCode: fcPathPlannerBCode,
      mapStateIn: (s) => ({
        pos:             (vb(s).sensors as ModelState).pos,
        windowCenter:    (vb(s).mission as ModelState).windowCenter,
        windowNormal:    (vb(s).mission as ModelState).windowNormal,
        windowIdx:       (vb(s).mission as ModelState).windowIdx,
        armed:           (vb(s).mission as ModelState).armed,
        phase:           (vb(s).mission as ModelState).phase,
        preGateDone:     (vb(s).planner as ModelState).preGateDone,
        activeWindowIdx: (vb(s).planner as ModelState).activeWindowIdx,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        planner: { carrot: out.carrot, preGateDone: out.preGateDone, activeWindowIdx: out.activeWindowIdx },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_navigator_b',
      exportName: 'fc_navigator',
      defaultFn: (s) => fc_navigator(s as Parameters<typeof fc_navigator>[0]),
      defaultCode: fcNavigatorCode,
      mapStateIn: (s) => ({
        pos:         (vb(s).sensors as ModelState).pos,
        vel:         (vb(s).sensors as ModelState).vel,
        attitude:    (vb(s).sensors as ModelState).attitude,
        carrot:      (vb(s).planner as ModelState).carrot,
        armed:       (vb(s).mission as ModelState).armed,
        integralPos: ((vb(s).fc as ModelState).integral as ModelState).pos,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        fc: {
          ...(vb(s).fc as ModelState),
          nav: { roll_des: out.roll_des, pitch_des: out.pitch_des, yaw_des: out.yaw_des, thrust: out.thrust },
          integral: { ...((vb(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_stabilizer_b',
      exportName: 'fc_stabilizer',
      defaultFn: (s) => fc_stabilizer(s as Parameters<typeof fc_stabilizer>[0]),
      defaultCode: fcStabilizerCode,
      mapStateIn: (s) => ({
        attitude:    (vb(s).sensors as ModelState).attitude,
        angularVel:  (vb(s).sensors as ModelState).angularVel,
        roll_des:    ((vb(s).fc as ModelState).nav as ModelState).roll_des,
        pitch_des:   ((vb(s).fc as ModelState).nav as ModelState).pitch_des,
        yaw_des:     ((vb(s).fc as ModelState).nav as ModelState).yaw_des,
        thrust:      ((vb(s).fc as ModelState).nav as ModelState).thrust,
        armed:       (vb(s).mission as ModelState).armed,
        integralAtt: ((vb(s).fc as ModelState).integral as ModelState).att,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        fc: {
          ...(vb(s).fc as ModelState),
          integral: { ...((vb(s).fc as ModelState).integral as ModelState), att: out.integralAtt },
        },
        motors: { ...(vb(s).motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_b',
      exportName: 'hw',
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s) => ({
        motors:     (vb(s).motors as ModelState).desired,
        thrustPrev: (vb(s).motors as ModelState).thrust,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        motors: { ...(vb(s).motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_b',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => ({
        pos: vb(s).pos, vel: vb(s).vel, attitude: vb(s).attitude, angularVel: vb(s).angularVel,
        thrust: (vb(s).motors as ModelState).thrust,
        windFx: (s.wind as ModelState).fx,
        windFz: (s.wind as ModelState).fz,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        pos: out.pos, vel: out.vel, acc: out.acc, attitude: out.attitude, angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },
  ],
  vis: QuadW1CombinedVis,
  blocksDiagram: [
    { from: 'wind',              to: 'world_a',          label: 'force'    },
    { from: 'noise_a',           to: 'mission_a',        label: 'pos'      },
    { from: 'noise_a',           to: 'fc_path_planner_a',label: 'pos'      },
    { from: 'noise_a',           to: 'fc_navigator_a',   label: 'sensors'  },
    { from: 'noise_a',           to: 'fc_stabilizer_a',  label: 'sensors'  },
    { from: 'mission_a',         to: 'fc_path_planner_a',label: 'window'   },
    { from: 'fc_path_planner_a', to: 'fc_navigator_a',   label: 'carrot'   },
    { from: 'fc_navigator_a',    to: 'fc_stabilizer_a',  label: 'att cmd'  },
    { from: 'fc_stabilizer_a',   to: 'hw_a',             label: 'motors'   },
    { from: 'hw_a',              to: 'world_a',          label: 'thrust'   },
    { from: 'world_a',           to: 'noise_a',          label: 'true state'},
    { from: 'wind',              to: 'world_b',          label: 'force'    },
    { from: 'noise_b',           to: 'mission_b',        label: 'pos'      },
    { from: 'noise_b',           to: 'fc_path_planner_b',label: 'pos'      },
    { from: 'noise_b',           to: 'fc_navigator_b',   label: 'sensors'  },
    { from: 'noise_b',           to: 'fc_stabilizer_b',  label: 'sensors'  },
    { from: 'mission_b',         to: 'fc_path_planner_b',label: 'window'   },
    { from: 'fc_path_planner_b', to: 'fc_navigator_b',   label: 'carrot'   },
    { from: 'fc_navigator_b',    to: 'fc_stabilizer_b',  label: 'att cmd'  },
    { from: 'fc_stabilizer_b',   to: 'hw_b',             label: 'motors'   },
    { from: 'hw_b',              to: 'world_b',          label: 'thrust'   },
    { from: 'world_b',           to: 'noise_b',          label: 'true state'},
  ],
  charts: [
    {
      label: 'Loops completed',
      series: [
        { var: 'vehicles.a.mission.loops', label: 'W1a (carrot)',    color: '#4488ff' },
        { var: 'vehicles.b.mission.loops', label: 'W1b (pre-gate)',  color: '#ff8800' },
      ],
    },
    {
      label: 'Mission phase',
      series: [
        { var: 'vehicles.a.mission.phase', label: 'A phase', color: '#4488ff' },
        { var: 'vehicles.b.mission.phase', label: 'B phase', color: '#ff8800' },
      ],
    },
    {
      label: 'Distance to target',
      series: [
        { var: 'vehicles.a.mission.dist', label: 'A dist', color: '#4488ff' },
        { var: 'vehicles.b.mission.dist', label: 'B dist', color: '#ff8800' },
      ],
    },
    {
      label: 'Speed (m/s)',
      series: [
        {
          label: 'A speed',
          color: '#4488ff',
          fn: (s) => {
            const v = ((s.vehicles as ModelState).a as ModelState).vel as ModelState;
            return Math.sqrt(((v.x as number) ?? 0) ** 2 + ((v.y as number) ?? 0) ** 2 + ((v.z as number) ?? 0) ** 2);
          },
        },
        {
          label: 'B speed',
          color: '#ff8800',
          fn: (s) => {
            const v = ((s.vehicles as ModelState).b as ModelState).vel as ModelState;
            return Math.sqrt(((v.x as number) ?? 0) ** 2 + ((v.y as number) ?? 0) ** 2 + ((v.z as number) ?? 0) ** 2);
          },
        },
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
