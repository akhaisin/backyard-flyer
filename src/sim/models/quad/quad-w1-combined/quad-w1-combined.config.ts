import windCode from './blocks/wind.ts?raw';
import { wind } from './blocks/wind';
import noiseCode from './blocks/noise.ts?raw';
import { noise } from './blocks/noise';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import fcAcroCode from './blocks/fc_acro.ts?raw';
import { fc_acro } from './blocks/fc_acro';
import navigatorWindowCode from './blocks/navigator_window.ts?raw';
import { navigator_window } from './blocks/navigator_window';
import missionACode from './blocks/mission_a.ts?raw';
import { mission_a } from './blocks/mission_a';
import missionBCode from './blocks/mission_b.ts?raw';
import { mission_b } from './blocks/mission_b';
import plannerWindowACode from './blocks/planner_window_a.ts?raw';
import { planner_window as planner_window_a } from './blocks/planner_window_a';
import plannerWindowBCode from './blocks/planner_window_b.ts?raw';
import { planner_window as planner_window_b } from './blocks/planner_window_b';
import validatorCode from './blocks/validator.ts?raw';
import { validator } from './blocks/validator';
import QuadW1CombinedVis from './quad-w1-combined.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const va = (s: ModelState): ModelState => ((s.vehicles as ModelState).a as ModelState);
const vb = (s: ModelState): ModelState => ((s.vehicles as ModelState).b as ModelState);

const writeVehicle = (s: ModelState, key: 'a' | 'b', patch: ModelState): ModelState => ({
  ...s,
  vehicles: { ...(s.vehicles as ModelState), [key]: { ...((s.vehicles as ModelState)[key] as ModelState), ...patch } },
});

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

const vehicleInit = (startX: number, startZ: number, preStageInit: number): ModelState => ({
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
    integral: { pos: { ...vec0 } },
  },
  aetr: { thrust: 0, roll: 0, pitch: 0, yaw: 0 },
  motors: {
    desired: { ...motors0 },
    thrust:  { ...motors0 },
  },
  mission: {
    phase:        0,
    stepIdx:      0,
    ticksInPhase: 0,
    armed:        0,
    step: {
      center:       { x: startX, y: 5, z: startZ },
      normal:       { x: 1, y: 0, z: 0 },
      width:        4,
      height:       4,
      preStageDist: preStageInit,
    },
    target:   { ...vec0 },
    dist:     0,
    segStart: { ...vec0 },
    segEnd:   { ...vec0 },
    loops:    0,
  },
  planner_window: {
    carrot:        { ...vec0 },
    yawSetpoint:   0,
    stepStatus:    0,
    windowSide:    0,
    activeStepIdx: -1,
    preGateDone:   0,
  },
  validator: {
    prevPhase:      0,
    lapsTotal:      0,
    lapErrSum:      0,
    lapErrTicks:    0,
    totalLapErrSum: 0,
    lapErr:         0,
    avgErr:         0,
    currentErr:     0,
    misses:         0,
  },
});

export const quadW1CombinedConfig: ModelConfig = {
  modelId: 'quad/quad-w1-combined',
  tickIntervalMs: 50,
  initialState: {
    wind: { fx: 0, fz: 0, ticksLeft: 0, season: 0 },
    vehicles: {
      a: vehicleInit(-15,  15, 0),    // track A — carrot only
      b: vehicleInit( 15, -15, 5),    // track B — pre-stage active
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
        stepIdx:      (va(s).mission as ModelState).stepIdx,
        ticksInPhase: (va(s).mission as ModelState).ticksInPhase,
        armed:        (va(s).mission as ModelState).armed,
        statusWindow: (va(s).planner_window as ModelState).stepStatus,
        loops:        (va(s).mission as ModelState).loops,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        mission: {
          ...(va(s).mission as ModelState),
          phase: out.phase, stepIdx: out.stepIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, step: out.step, target: out.target, dist: out.dist,
          segStart: out.segStart, segEnd: out.segEnd, loops: out.loops,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_window_a',
      exportName: 'planner_window',
      defaultFn: (s) => planner_window_a(s as Parameters<typeof planner_window_a>[0]),
      defaultCode: plannerWindowACode,
      mapStateIn: (s) => ({
        pos:           (va(s).sensors as ModelState).pos,
        step:          (va(s).mission as ModelState).step,
        stepIdx:       (va(s).mission as ModelState).stepIdx,
        armed:         (va(s).mission as ModelState).armed,
        phase:         (va(s).mission as ModelState).phase,
        yawSetpoint:   (va(s).planner_window as ModelState).yawSetpoint,
        windowSide:    (va(s).planner_window as ModelState).windowSide,
        activeStepIdx: (va(s).planner_window as ModelState).activeStepIdx,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        planner_window: {
          ...(va(s).planner_window as ModelState),
          carrot: out.carrot, yawSetpoint: out.yawSetpoint, stepStatus: out.stepStatus,
          windowSide: out.windowSide, activeStepIdx: out.activeStepIdx,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_window_a',
      exportName: 'navigator_window',
      defaultFn: (s) => navigator_window(s as Parameters<typeof navigator_window>[0]),
      defaultCode: navigatorWindowCode,
      mapStateIn: (s) => ({
        pos:         (va(s).sensors as ModelState).pos,
        vel:         (va(s).sensors as ModelState).vel,
        attitude:    (va(s).sensors as ModelState).attitude,
        carrot:      (va(s).planner_window as ModelState).carrot,
        yawSetpoint: (va(s).planner_window as ModelState).yawSetpoint,
        armed:       (va(s).mission as ModelState).armed,
        integralPos: ((va(s).fc as ModelState).integral as ModelState).pos,
        aetr:        va(s).aetr,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        aetr: out.aetr,
        fc: {
          ...(va(s).fc as ModelState),
          integral: { ...((va(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_acro_a',
      exportName: 'fc_acro',
      defaultFn: (s) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s) => ({
        angularVel: (va(s).sensors as ModelState).angularVel,
        armed:      (va(s).mission as ModelState).armed,
        aetrThrust: (va(s).aetr as ModelState).thrust,
        aetrRoll:   (va(s).aetr as ModelState).roll,
        aetrPitch:  (va(s).aetr as ModelState).pitch,
        aetrYaw:    (va(s).aetr as ModelState).yaw,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
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
    {
      sourceId: 'validator_a',
      exportName: 'validator',
      defaultFn: (s) => validator(s as Parameters<typeof validator>[0]),
      defaultCode: validatorCode,
      mapStateIn: (s) => ({
        pos:            va(s).pos,
        phase:          (va(s).mission as ModelState).phase,
        segStart:       (va(s).mission as ModelState).segStart,
        segEnd:         (va(s).mission as ModelState).segEnd,
        prevPhase:      (va(s).validator as ModelState).prevPhase,
        lapsTotal:      (va(s).validator as ModelState).lapsTotal,
        lapErrSum:      (va(s).validator as ModelState).lapErrSum,
        lapErrTicks:    (va(s).validator as ModelState).lapErrTicks,
        totalLapErrSum: (va(s).validator as ModelState).totalLapErrSum,
        misses:         (va(s).validator as ModelState).misses,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'a', {
        validator: {
          ...(va(s).validator as ModelState),
          prevPhase:      out.prevPhase,
          lapsTotal:      out.lapsTotal,
          lapErrSum:      out.lapErrSum,
          lapErrTicks:    out.lapErrTicks,
          totalLapErrSum: out.totalLapErrSum,
          lapErr:         out.lapErr,
          avgErr:         out.avgErr,
          currentErr:     out.currentErr,
          misses:         out.misses,
        },
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
        stepIdx:      (vb(s).mission as ModelState).stepIdx,
        ticksInPhase: (vb(s).mission as ModelState).ticksInPhase,
        armed:        (vb(s).mission as ModelState).armed,
        statusWindow: (vb(s).planner_window as ModelState).stepStatus,
        loops:        (vb(s).mission as ModelState).loops,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        mission: {
          ...(vb(s).mission as ModelState),
          phase: out.phase, stepIdx: out.stepIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, step: out.step, target: out.target, dist: out.dist,
          segStart: out.segStart, segEnd: out.segEnd, loops: out.loops,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_window_b',
      exportName: 'planner_window',
      defaultFn: (s) => planner_window_b(s as Parameters<typeof planner_window_b>[0]),
      defaultCode: plannerWindowBCode,
      mapStateIn: (s) => ({
        pos:           (vb(s).sensors as ModelState).pos,
        step:          (vb(s).mission as ModelState).step,
        stepIdx:       (vb(s).mission as ModelState).stepIdx,
        armed:         (vb(s).mission as ModelState).armed,
        phase:         (vb(s).mission as ModelState).phase,
        yawSetpoint:   (vb(s).planner_window as ModelState).yawSetpoint,
        windowSide:    (vb(s).planner_window as ModelState).windowSide,
        activeStepIdx: (vb(s).planner_window as ModelState).activeStepIdx,
        preGateDone:   (vb(s).planner_window as ModelState).preGateDone,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        planner_window: {
          ...(vb(s).planner_window as ModelState),
          carrot: out.carrot, yawSetpoint: out.yawSetpoint, stepStatus: out.stepStatus,
          windowSide: out.windowSide, activeStepIdx: out.activeStepIdx,
          preGateDone: out.preGateDone,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_window_b',
      exportName: 'navigator_window',
      defaultFn: (s) => navigator_window(s as Parameters<typeof navigator_window>[0]),
      defaultCode: navigatorWindowCode,
      mapStateIn: (s) => ({
        pos:         (vb(s).sensors as ModelState).pos,
        vel:         (vb(s).sensors as ModelState).vel,
        attitude:    (vb(s).sensors as ModelState).attitude,
        carrot:      (vb(s).planner_window as ModelState).carrot,
        yawSetpoint: (vb(s).planner_window as ModelState).yawSetpoint,
        armed:       (vb(s).mission as ModelState).armed,
        integralPos: ((vb(s).fc as ModelState).integral as ModelState).pos,
        aetr:        vb(s).aetr,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        aetr: out.aetr,
        fc: {
          ...(vb(s).fc as ModelState),
          integral: { ...((vb(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_acro_b',
      exportName: 'fc_acro',
      defaultFn: (s) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s) => ({
        angularVel: (vb(s).sensors as ModelState).angularVel,
        armed:      (vb(s).mission as ModelState).armed,
        aetrThrust: (vb(s).aetr as ModelState).thrust,
        aetrRoll:   (vb(s).aetr as ModelState).roll,
        aetrPitch:  (vb(s).aetr as ModelState).pitch,
        aetrYaw:    (vb(s).aetr as ModelState).yaw,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
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
    {
      sourceId: 'validator_b',
      exportName: 'validator',
      defaultFn: (s) => validator(s as Parameters<typeof validator>[0]),
      defaultCode: validatorCode,
      mapStateIn: (s) => ({
        pos:            vb(s).pos,
        phase:          (vb(s).mission as ModelState).phase,
        segStart:       (vb(s).mission as ModelState).segStart,
        segEnd:         (vb(s).mission as ModelState).segEnd,
        prevPhase:      (vb(s).validator as ModelState).prevPhase,
        lapsTotal:      (vb(s).validator as ModelState).lapsTotal,
        lapErrSum:      (vb(s).validator as ModelState).lapErrSum,
        lapErrTicks:    (vb(s).validator as ModelState).lapErrTicks,
        totalLapErrSum: (vb(s).validator as ModelState).totalLapErrSum,
        misses:         (vb(s).validator as ModelState).misses,
      }),
      mapStateOut: (out, s) => writeVehicle(s, 'b', {
        validator: {
          ...(vb(s).validator as ModelState),
          prevPhase:      out.prevPhase,
          lapsTotal:      out.lapsTotal,
          lapErrSum:      out.lapErrSum,
          lapErrTicks:    out.lapErrTicks,
          totalLapErrSum: out.totalLapErrSum,
          lapErr:         out.lapErr,
          avgErr:         out.avgErr,
          currentErr:     out.currentErr,
          misses:         out.misses,
        },
      }),
      tickFrequency: 1,
    },
  ],
  vis: QuadW1CombinedVis,
  blocksDiagram: [
    { from: 'wind',                to: 'world_a',            label: 'force'      },
    { from: 'noise_a',             to: 'mission_a',          label: 'pos'        },
    { from: 'noise_a',             to: 'planner_window_a',   label: 'pos'        },
    { from: 'noise_a',             to: 'navigator_window_a', label: 'sensors'    },
    { from: 'noise_a',             to: 'fc_acro_a',          label: 'rates'      },
    { from: 'mission_a',           to: 'planner_window_a',   label: 'step'       },
    { from: 'planner_window_a',    to: 'mission_a',          label: 'status'     },
    { from: 'planner_window_a',    to: 'navigator_window_a', label: 'carrot+yaw' },
    { from: 'navigator_window_a',  to: 'fc_acro_a',          label: 'aetr'       },
    { from: 'fc_acro_a',           to: 'hw_a',               label: 'motors'     },
    { from: 'hw_a',                to: 'world_a',            label: 'thrust'     },
    { from: 'world_a',             to: 'noise_a',            label: 'true state' },
    { from: 'world_a',             to: 'validator_a',        label: 'pos'        },
    { from: 'mission_a',           to: 'validator_a',        label: 'phase+seg'  },
    { from: 'wind',                to: 'world_b',            label: 'force'      },
    { from: 'noise_b',             to: 'mission_b',          label: 'pos'        },
    { from: 'noise_b',             to: 'planner_window_b',   label: 'pos'        },
    { from: 'noise_b',             to: 'navigator_window_b', label: 'sensors'    },
    { from: 'noise_b',             to: 'fc_acro_b',          label: 'rates'      },
    { from: 'mission_b',           to: 'planner_window_b',   label: 'step'       },
    { from: 'planner_window_b',    to: 'mission_b',          label: 'status'     },
    { from: 'planner_window_b',    to: 'navigator_window_b', label: 'carrot+yaw' },
    { from: 'navigator_window_b',  to: 'fc_acro_b',          label: 'aetr'       },
    { from: 'fc_acro_b',           to: 'hw_b',               label: 'motors'     },
    { from: 'hw_b',                to: 'world_b',            label: 'thrust'     },
    { from: 'world_b',             to: 'noise_b',            label: 'true state' },
    { from: 'world_b',             to: 'validator_b',        label: 'pos'        },
    { from: 'mission_b',           to: 'validator_b',        label: 'phase+seg'  },
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
    {
      label: 'Track error (m) — current',
      series: [
        { var: 'vehicles.a.validator.currentErr', label: 'A current err', color: '#4488ff' },
        { var: 'vehicles.b.validator.currentErr', label: 'B current err', color: '#ff8800' },
      ],
    },
    {
      label: 'Track error (m) — lap avg',
      series: [
        { var: 'vehicles.a.validator.avgErr', label: 'A avg err', color: '#4488ff' },
        { var: 'vehicles.b.validator.avgErr', label: 'B avg err', color: '#ff8800' },
      ],
    },
    {
      label: 'Misses',
      series: [
        { var: 'vehicles.a.validator.misses', label: 'A misses', color: '#4488ff' },
        { var: 'vehicles.b.validator.misses', label: 'B misses', color: '#ff8800' },
      ],
    },
  ],
};
