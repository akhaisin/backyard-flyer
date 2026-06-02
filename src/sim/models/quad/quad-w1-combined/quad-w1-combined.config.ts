import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
import plannerW1aCode from '../../lib/quad/planner_w1a.ts?raw';
import { planner_w1a } from '../../lib/quad/planner_w1a';
import plannerW1bCode from '../../lib/quad/planner_w1b.ts?raw';
import { planner_w1b } from '../../lib/quad/planner_w1b';
import plannerWpCode from '../../lib/quad/planner_wp.ts?raw';
import { planner_wp } from '../../lib/quad/planner_wp';
import navigatorW1Code from '../../lib/quad/navigator_w1.ts?raw';
import { navigator_w1 } from '../../lib/quad/navigator_w1';
import fcAcroCode from '../../lib/quad/fc_acro.ts?raw';
import { fc_acro } from '../../lib/quad/fc_acro';
import hwCode from '../../lib/quad/hw.ts?raw';
import { hw } from '../../lib/quad/hw';
import noiseCode from '../../lib/quad/noise.ts?raw';
import { noise } from '../../lib/quad/noise';
import windCode from '../../lib/quad/wind.ts?raw';
import { wind } from '../../lib/quad/wind';
import worldCode from '../../lib/quad/world.ts?raw';
import { world } from '../../lib/quad/world';
import { makeCombinedLifecycleBlock } from './lifecycle';
import { QUAD_DEFAULTS } from '../../lib/quad/consts';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';
import { W1COMB_A_ROUTE, W1COMB_B_ROUTE, HOME_A, HOME_B } from './route';
import QuadW1CombinedVis from './quad-w1-combined.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const va = (s: ModelState): ModelState => ((s.vehicles as ModelState).a as ModelState);
const vb = (s: ModelState): ModelState => ((s.vehicles as ModelState).b as ModelState);

const writeVehicle = (s: ModelState, key: 'a' | 'b', patch: ModelState): ModelState => ({
  ...s,
  vehicles: { ...(s.vehicles as ModelState), [key]: { ...((s.vehicles as ModelState)[key] as ModelState), ...patch } },
});

// Per-vehicle K view: shared scalars + this track's route and home, so the lib
// mission (which reads K.steps / K.HOME_X/Z) flies the right offset course.
const missionK = (s: ModelState, route: 'stepsA' | 'stepsB', home: { x: number; z: number }): ModelState =>
  ({ ...(s.K as ModelState), steps: (s.K as ModelState)[route], HOME_X: home.x, HOME_Z: home.z });

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

const vehicleInit = (home: { x: number; z: number }, first: StepDef, preStage: boolean): ModelState => ({
  pos:        { x: home.x, y: 0, z: home.z },
  vel:        { ...vec0 },
  acc:        { ...vec0 },
  attitude:   { ...vec0 },
  angularVel: { ...vec0 },
  sensors: {
    pos:        { x: home.x, y: 0, z: home.z },
    vel:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
  },
  fc: {
    integral: { pos: { ...vec0 } },
    yawMeas:  0,
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
      pos:          { ...first.pos },
      normal:       first.normal ?? { x: 1, y: 0, z: 0 },
      width:        first.width  ?? 4,
      height:       first.height ?? 4,
      preStageDist: first.preStageDist ?? 0,
    },
    target:   { ...vec0 },
    dist:     0,
    segStart: { ...vec0 },
    segEnd:   { ...vec0 },
  },
  planner: preStage
    ? { carrot: { ...vec0 }, yawSetpoint: 0, stepStatus: 0, windowSide: 0, activeStepIdx: -1, preGateDone: 0 }
    : { carrot: { ...vec0 }, yawSetpoint: 0, stepStatus: 0, windowSide: 0, activeStepIdx: -1 },
  planner_wp: { stepStatus: 0 },
  validator: {
    prevPhase:        0,
    lapsTotal:        0,
    restarts:         0,
    completionTick:   -1,
    completionAccErr: -1,
    currentErr:       0,
    accErr:           0,
    passCount:        0,
    passTotal:        4,
    pass:            -1,
  },
});

// Per-vehicle block set. `pl`/`plCode` select the carrot (w1a) or pre-stage
// (w1b) planner; everything else is the shared lib stack, wired into the a/b
// state namespace via va/vb + writeVehicle.
function vehicleBlocks(
  key: 'a' | 'b',
  v: (s: ModelState) => ModelState,
  routeKey: 'stepsA' | 'stepsB',
  home: { x: number; z: number },
  pl: typeof planner_w1a | typeof planner_w1b,
  plCode: string,
  plSourceId: string,
  preStage: boolean,
) {
  return [
    {
      sourceId: `noise_${key}`,
      exportName: 'noise',
      defaultFn: (s: ModelState) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn:  (s: ModelState) => ({ pos: v(s).pos, vel: v(s).vel, attitude: v(s).attitude, angularVel: v(s).angularVel, K: s.K }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, { sensors: out }),
      tickFrequency: 1,
    },
    {
      sourceId: `mission_${key}`,
      exportName: 'mission',
      defaultFn: (s: ModelState) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s: ModelState) => ({
        pos:          (v(s).sensors as ModelState).pos,
        phase:        (v(s).mission as ModelState).phase,
        stepIdx:      (v(s).mission as ModelState).stepIdx,
        ticksInPhase: (v(s).mission as ModelState).ticksInPhase,
        armed:        (v(s).mission as ModelState).armed,
        statusWp:     (v(s).planner as ModelState).stepStatus,
        statusReturn: (v(s).planner_wp as ModelState).stepStatus,
        K:            missionK(s, routeKey, home),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        mission: {
          ...(v(s).mission as ModelState),
          phase: out.phase, stepIdx: out.stepIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, step: out.step, target: out.target, dist: out.dist,
          segStart: out.segStart, segEnd: out.segEnd,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: plSourceId,
      exportName: plSourceId,
      defaultFn: (s: ModelState) => (pl as typeof planner_w1b)(s as Parameters<typeof planner_w1b>[0]),
      defaultCode: plCode,
      mapStateIn: (s: ModelState) => ({
        pos:           (v(s).sensors as ModelState).pos,
        step:          (v(s).mission as ModelState).step,
        stepIdx:       (v(s).mission as ModelState).stepIdx,
        armed:         (v(s).mission as ModelState).armed,
        phase:         (v(s).mission as ModelState).phase,
        yawSetpoint:   (v(s).planner as ModelState).yawSetpoint,
        windowSide:    (v(s).planner as ModelState).windowSide,
        activeStepIdx: (v(s).planner as ModelState).activeStepIdx,
        preGateDone:   (v(s).planner as ModelState).preGateDone ?? 0,
        K:             s.K,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        planner: preStage
          ? { carrot: out.carrot, yawSetpoint: out.yawSetpoint, stepStatus: out.stepStatus, windowSide: out.windowSide, activeStepIdx: out.activeStepIdx, preGateDone: out.preGateDone }
          : { carrot: out.carrot, yawSetpoint: out.yawSetpoint, stepStatus: out.stepStatus, windowSide: out.windowSide, activeStepIdx: out.activeStepIdx },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: `planner_wp_${key}`,
      exportName: 'planner_wp',
      defaultFn: (s: ModelState) => planner_wp(s as Parameters<typeof planner_wp>[0]),
      defaultCode: plannerWpCode,
      mapStateIn: (s: ModelState) => ({
        pos:   (v(s).sensors as ModelState).pos,
        step:  (v(s).mission as ModelState).step,
        armed: (v(s).mission as ModelState).armed,
        phase: (v(s).mission as ModelState).phase,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, { planner_wp: { stepStatus: out.stepStatus } }),
      tickFrequency: 1,
    },
    {
      sourceId: `navigator_${key}`,
      exportName: 'navigator_w1',
      defaultFn: (s: ModelState) => navigator_w1(s as Parameters<typeof navigator_w1>[0]),
      defaultCode: navigatorW1Code,
      mapStateIn: (s: ModelState) => ({
        pos:         (v(s).sensors as ModelState).pos,
        vel:         (v(s).sensors as ModelState).vel,
        attitude:    (v(s).sensors as ModelState).attitude,
        carrot:      (v(s).planner as ModelState).carrot,
        yawSetpoint: (v(s).planner as ModelState).yawSetpoint,
        armed:       (v(s).mission as ModelState).armed,
        integralPos: ((v(s).fc as ModelState).integral as ModelState).pos,
        yawMeas:     (v(s).fc as ModelState).yawMeas,
        aetr:        v(s).aetr,
        K:           s.K,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        aetr: out.aetr,
        fc: {
          ...(v(s).fc as ModelState),
          integral: { ...((v(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
          yawMeas:  out.yawMeas,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: `fc_acro_${key}`,
      exportName: 'fc_acro',
      defaultFn: (s: ModelState) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s: ModelState) => ({
        angularVel: (v(s).sensors as ModelState).angularVel,
        armed:      (v(s).mission as ModelState).armed,
        aetrThrust: (v(s).aetr as ModelState).thrust,
        aetrRoll:   (v(s).aetr as ModelState).roll,
        aetrPitch:  (v(s).aetr as ModelState).pitch,
        aetrYaw:    (v(s).aetr as ModelState).yaw,
        K:          s.K,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        motors: { ...(v(s).motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: `hw_${key}`,
      exportName: 'hw',
      defaultFn: (s: ModelState) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s: ModelState) => ({
        motors:     (v(s).motors as ModelState).desired,
        thrustPrev: (v(s).motors as ModelState).thrust,
        K:          s.K,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        motors: { ...(v(s).motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: `world_${key}`,
      exportName: 'world',
      defaultFn: (s: ModelState) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s: ModelState) => ({
        pos: v(s).pos, vel: v(s).vel, attitude: v(s).attitude, angularVel: v(s).angularVel,
        thrust: (v(s).motors as ModelState).thrust,
        windFx: (s.wind as ModelState).fx,
        windFz: (s.wind as ModelState).fz,
        K:      s.K,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, key, {
        pos: out.pos, vel: out.vel, acc: out.acc, attitude: out.attitude, angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },
  ];
}

export function quadW1CombinedConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const modelOverrides: Partial<QuadConsts> = {
    KI_POS:        0.3,
    MAX_TILT:      0.4,
    ACC_ERR_LIMIT: 8000,
    MAX_RESTARTS:  4,
    KP_YAW_OUTER:  5.0,
    YAW_MEAS_LPF:  0.35,
    MAX_TICKS:     5000,
    simDuration:   9000,
    ...overrides,
  };

  return {
    modelId: 'quad/quad-w1-combined',
    tickIntervalMs: 50,
    initialState: {
      wind: { fx: 0, fz: 0, ticksLeft: 0, season: 0 },
      vehicles: {
        a: vehicleInit(HOME_A, W1COMB_A_ROUTE[0], false),  // carrot
        b: vehicleInit(HOME_B, W1COMB_B_ROUTE[0], true),   // pre-stage
      },
    },
    blocks: [
      makeCombinedLifecycleBlock(QUAD_DEFAULTS, modelOverrides, W1COMB_A_ROUTE, W1COMB_B_ROUTE),
      {
        sourceId: 'wind',
        exportName: 'wind',
        defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
        defaultCode: windCode,
        mapStateIn:  (s) => ({ ...(s.wind as ModelState), K: s.K }),
        mapStateOut: (out, s) => ({ ...s, wind: out }),
        tickFrequency: 1,
      },
      ...vehicleBlocks('a', va, 'stepsA', HOME_A, planner_w1a, plannerW1aCode, 'planner_w1a', false),
      ...vehicleBlocks('b', vb, 'stepsB', HOME_B, planner_w1b, plannerW1bCode, 'planner_w1b', true),
    ],
    vis: QuadW1CombinedVis,
    blocksDiagram: [
      // shared
      { from: 'lifecycle',    to: 'mission_a',    label: 'K'          },
      { from: 'lifecycle',    to: 'mission_b',    label: 'K'          },
      { from: 'wind',         to: 'world_a',      label: 'force'      },
      { from: 'wind',         to: 'world_b',      label: 'force'      },
      // vehicle A (carrot)
      { from: 'noise_a',      to: 'mission_a',    label: 'pos'        },
      { from: 'noise_a',      to: 'planner_w1a',  label: 'pos'        },
      { from: 'noise_a',      to: 'navigator_a',  label: 'sensors'    },
      { from: 'noise_a',      to: 'fc_acro_a',    label: 'rates'      },
      { from: 'mission_a',    to: 'planner_w1a',  label: 'step'       },
      { from: 'planner_w1a',  to: 'mission_a',    label: 'status'     },
      { from: 'mission_a',    to: 'planner_wp_a', label: 'anchor'     },
      { from: 'planner_wp_a', to: 'mission_a',    label: 'return'     },
      { from: 'planner_w1a',  to: 'navigator_a',  label: 'carrot+yaw' },
      { from: 'navigator_a',  to: 'fc_acro_a',    label: 'aetr'       },
      { from: 'fc_acro_a',    to: 'hw_a',         label: 'motors'     },
      { from: 'hw_a',         to: 'world_a',      label: 'thrust'     },
      { from: 'world_a',      to: 'noise_a',      label: 'true state' },
      // vehicle B (pre-stage)
      { from: 'noise_b',      to: 'mission_b',    label: 'pos'        },
      { from: 'noise_b',      to: 'planner_w1b',  label: 'pos'        },
      { from: 'noise_b',      to: 'navigator_b',  label: 'sensors'    },
      { from: 'noise_b',      to: 'fc_acro_b',    label: 'rates'      },
      { from: 'mission_b',    to: 'planner_w1b',  label: 'step'       },
      { from: 'planner_w1b',  to: 'mission_b',    label: 'status'     },
      { from: 'mission_b',    to: 'planner_wp_b', label: 'anchor'     },
      { from: 'planner_wp_b', to: 'mission_b',    label: 'return'     },
      { from: 'planner_w1b',  to: 'navigator_b',  label: 'carrot+yaw' },
      { from: 'navigator_b',  to: 'fc_acro_b',    label: 'aetr'       },
      { from: 'fc_acro_b',    to: 'hw_b',         label: 'motors'     },
      { from: 'hw_b',         to: 'world_b',      label: 'thrust'     },
      { from: 'world_b',      to: 'noise_b',      label: 'true state' },
    ],
    charts: [
      {
        label: 'Laps completed',
        series: [
          { var: 'vehicles.a.validator.lapsTotal', label: 'A (carrot)',    color: '#4488ff' },
          { var: 'vehicles.b.validator.lapsTotal', label: 'B (pre-stage)', color: '#ff8800' },
        ],
      },
      {
        label: 'Restarts (missed gates)',
        series: [
          { var: 'vehicles.a.validator.restarts', label: 'A restarts', color: '#4488ff' },
          { var: 'vehicles.b.validator.restarts', label: 'B restarts', color: '#ff8800' },
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
        label: 'Track error — current (m)',
        series: [
          { var: 'vehicles.a.validator.currentErr', label: 'A current', color: '#4488ff' },
          { var: 'vehicles.b.validator.currentErr', label: 'B current', color: '#ff8800' },
        ],
      },
      {
        label: 'Track error — accumulated (IAE)',
        series: [
          { var: 'vehicles.a.validator.accErr', label: 'A accErr', color: '#4488ff' },
          { var: 'vehicles.b.validator.accErr', label: 'B accErr', color: '#ff8800' },
        ],
      },
      {
        label: 'Speed (m/s)',
        series: [
          {
            label: 'A speed',
            color: '#4488ff',
            fn: (s) => {
              const vv = ((s.vehicles as ModelState).a as ModelState).vel as ModelState;
              return Math.sqrt(((vv.x as number) ?? 0) ** 2 + ((vv.y as number) ?? 0) ** 2 + ((vv.z as number) ?? 0) ** 2);
            },
          },
          {
            label: 'B speed',
            color: '#ff8800',
            fn: (s) => {
              const vv = ((s.vehicles as ModelState).b as ModelState).vel as ModelState;
              return Math.sqrt(((vv.x as number) ?? 0) ** 2 + ((vv.y as number) ?? 0) ** 2 + ((vv.z as number) ?? 0) ** 2);
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
}
