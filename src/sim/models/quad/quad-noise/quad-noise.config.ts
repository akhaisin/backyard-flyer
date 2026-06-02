import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
import plannerWpCode from '../../lib/quad/planner_wp.ts?raw';
import { planner_wp } from '../../lib/quad/planner_wp';
import navigatorWpCode from '../../lib/quad/navigator_wp.ts?raw';
import { navigator_wp } from '../../lib/quad/navigator_wp';
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
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS } from '../../lib/quad/consts';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';
import QuadNoiseVis from './quad-noise.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

export function quadNoiseConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const route: StepDef[] = [
    { pos: { x: 8, y: 5, z: 0 }, threshold: 1.2 },
    { pos: { x: 8, y: 5, z: 8 }, threshold: 1.2 },
    { pos: { x: 0, y: 5, z: 8 }, threshold: 1.2 },
    { pos: { x: 0, y: 5, z: 0 }, threshold: 1.2 },
  ];
  const modelOverrides: Partial<QuadConsts> = {
    ACC_ERR_LIMIT: 1500,
    ...overrides,
  };

  return {
  modelId: 'quad/quad-noise',
  tickIntervalMs: 50,
  initialState: {
    pos:        { ...vec0 },
    vel:        { ...vec0 },
    acc:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
    wind: { fx: 0, fz: 0, ticksLeft: 0, season: 0 },
    sensors: {
      pos:        { ...vec0 },
      vel:        { ...vec0 },
      attitude:   { ...vec0 },
      angularVel: { ...vec0 },
    },
    fc: {
      integral: { pos: { ...vec0 } },
    },
    aetr:           { thrust: 0, roll: 0, pitch: 0, yaw: 0 },
    motors: {
      desired: { ...motors0 },
      thrust:  { ...motors0 },
    },
    mission: {
      phase:        0,
      stepIdx:      0,
      ticksInPhase: 0,
      armed:        0,
      step:         { pos: { x: 0, y: 5, z: 0 }, threshold: 1.2 },
      target:       { ...vec0 },
      dist:         0,
      segStart:     { ...vec0 },
      segEnd:       { ...vec0 },
    },
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
      passTotal:        3,
      pass:            -1,
    },
  },
  blocks: [
    makeLifecycleBlock(QUAD_DEFAULTS, route, modelOverrides),
    // --- Environment ---
    {
      sourceId: 'wind',
      exportName: 'wind',
      defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
      defaultCode: windCode,
      mapStateIn:  (s) => ({ ...(s.wind as ModelState), K: s.K }),
      mapStateOut: (out, s) => ({ ...s, wind: out }),
      tickFrequency: 1,
    },
    {
      sourceId: 'noise',
      exportName: 'noise',
      defaultFn: (s) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn: (s) => ({
        pos:        s.pos,
        vel:        s.vel,
        attitude:   s.attitude,
        angularVel: s.angularVel,
        K:          s.K,
      }),
      mapStateOut: (out, s) => ({ ...s, sensors: out }),
      tickFrequency: 1,
    },

    // --- Flight stack (reads noisy sensors) ---
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s) => ({
        pos:          (s.sensors as ModelState).pos,
        phase:        (s.mission as ModelState).phase,
        stepIdx:      (s.mission as ModelState).stepIdx,
        ticksInPhase: (s.mission as ModelState).ticksInPhase,
        armed:        (s.mission as ModelState).armed,
        statusWp:     (s.planner_wp as ModelState).stepStatus,
        K:            s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        mission: {
          ...(s.mission as ModelState),
          phase:        out.phase,
          stepIdx:      out.stepIdx,
          ticksInPhase: out.ticksInPhase,
          armed:        out.armed,
          step:         out.step,
          target:       out.target,
          dist:         out.dist,
          segStart:     out.segStart,
          segEnd:       out.segEnd,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_wp',
      exportName: 'planner_wp',
      defaultFn: (s) => planner_wp(s as Parameters<typeof planner_wp>[0]),
      defaultCode: plannerWpCode,
      mapStateIn: (s) => ({
        pos:         (s.sensors as ModelState).pos,
        step:        (s.mission as ModelState).step,
        armed:       (s.mission as ModelState).armed,
        phase:       (s.mission as ModelState).phase,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_wp: { stepStatus: out.stepStatus },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_wp',
      exportName: 'navigator_wp',
      defaultFn: (s) => navigator_wp(s as Parameters<typeof navigator_wp>[0]),
      defaultCode: navigatorWpCode,
      mapStateIn: (s) => ({
        pos:         (s.sensors as ModelState).pos,
        vel:         (s.sensors as ModelState).vel,
        attitude:    (s.sensors as ModelState).attitude,
        angularVel:  (s.sensors as ModelState).angularVel,
        step:        (s.mission as ModelState).step,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
        aetr:        s.aetr,
        K:           s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        aetr: out.aetr,
        fc: {
          ...(s.fc as ModelState),
          integral: { ...(((s.fc as ModelState).integral) as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_acro',
      exportName: 'fc_acro',
      defaultFn: (s) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s) => ({
        angularVel: (s.sensors as ModelState).angularVel,
        armed:      (s.mission as ModelState).armed,
        aetrThrust: (s.aetr as ModelState).thrust,
        aetrRoll:   (s.aetr as ModelState).roll,
        aetrPitch:  (s.aetr as ModelState).pitch,
        aetrYaw:    (s.aetr as ModelState).yaw,
        K:          s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        motors: { ...(s.motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw',
      exportName: 'hw',
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s) => ({
        motors:     (s.motors as ModelState).desired,
        thrustPrev: (s.motors as ModelState).thrust,
        K:          s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        motors: { ...(s.motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => ({
        pos:        s.pos,
        vel:        s.vel,
        attitude:   s.attitude,
        angularVel: s.angularVel,
        thrust:     (s.motors as ModelState).thrust,
        windFx:     (s.wind as ModelState).fx,
        windFz:     (s.wind as ModelState).fz,
        K:          s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        pos:        out.pos,
        vel:        out.vel,
        acc:        out.acc,
        attitude:   out.attitude,
        angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },
    // validator now lives in the lifecycle block's after() hook.
  ],
  vis: QuadNoiseVis,
  blocksDiagram: [
    { from: 'lifecycle',    to: 'mission',      label: 'K'          },
    { from: 'wind',         to: 'world',        label: 'force'      },
    { from: 'noise',        to: 'mission',      label: 'pos'        },
    { from: 'noise',        to: 'planner_wp',   label: 'pos'        },
    { from: 'noise',        to: 'navigator_wp', label: 'sensors'    },
    { from: 'noise',        to: 'fc_acro',      label: 'rates'      },
    { from: 'mission',      to: 'planner_wp',   label: 'step'       },
    { from: 'planner_wp',   to: 'mission',      label: 'status'     },
    { from: 'mission',      to: 'navigator_wp', label: 'step'       },
    { from: 'navigator_wp', to: 'fc_acro',      label: 'aetr'       },
    { from: 'fc_acro',      to: 'hw',           label: 'motors'     },
    { from: 'hw',           to: 'world',        label: 'thrust'     },
    { from: 'world',        to: 'noise',        label: 'true state' },
  ],
  charts: [
    {
      label: 'Mission',
      series: [
        { var: 'mission.phase',   label: 'phase',   color: '#ffaa00' },
        { var: 'mission.stepIdx', label: 'stepIdx', color: '#00ffaa' },
        { var: 'mission.armed',   label: 'armed',   color: '#aaaaaa' },
      ],
    },
    {
      label: 'Speed (m/s)',
      series: [{
        label: 'speed',
        color: '#aaffff',
        fn: (s) => {
          const v = s.vel as ModelState;
          return Math.sqrt(((v.x as number) ?? 0) ** 2 + ((v.y as number) ?? 0) ** 2 + ((v.z as number) ?? 0) ** 2);
        },
      }],
    },
    {
      label: 'Position (true vs noisy)',
      series: [
        { var: 'pos.x',          label: 'x true',   color: '#ff4444' },
        { var: 'sensors.pos.x',  label: 'x noisy',  color: '#ff9999' },
        { var: 'pos.y',          label: 'y true',   color: '#44ff44' },
        { var: 'sensors.pos.y',  label: 'y noisy',  color: '#99ff99' },
        { var: 'pos.z',          label: 'z true',   color: '#4488ff' },
        { var: 'sensors.pos.z',  label: 'z noisy',  color: '#99ccff' },
      ],
    },
    {
      label: 'Attitude (rad)',
      series: [
        { var: 'attitude.x', label: 'roll',  color: '#ff8844' },
        { var: 'attitude.z', label: 'pitch', color: '#44ffaa' },
        { var: 'attitude.y', label: 'yaw',   color: '#cc88ff' },
      ],
    },
    {
      label: 'AETR sticks',
      series: [
        { var: 'aetr.thrust', label: 'thrust', color: '#ffee44' },
        { var: 'aetr.roll',   label: 'roll',   color: '#ff8844' },
        { var: 'aetr.pitch',  label: 'pitch',  color: '#44ffaa' },
        { var: 'aetr.yaw',    label: 'yaw',    color: '#cc88ff' },
      ],
    },
    {
      label: 'Motor power (0–1)',
      series: [
        { var: 'motors.desired.m0', label: 'M0 FL', color: '#ff4444' },
        { var: 'motors.desired.m1', label: 'M1 FR', color: '#ffaa00' },
        { var: 'motors.desired.m2', label: 'M2 RR', color: '#44ff88' },
        { var: 'motors.desired.m3', label: 'M3 RL', color: '#4488ff' },
      ],
    },
    {
      label: 'Angular rates (rad/s)',
      series: [
        { var: 'angularVel.x', label: 'roll rate',  color: '#ff8844' },
        { var: 'angularVel.z', label: 'pitch rate', color: '#44ffaa' },
        { var: 'angularVel.y', label: 'yaw rate',   color: '#cc88ff' },
      ],
    },
    {
      label: 'Wind force (N)',
      series: [
        { var: 'wind.fx', label: 'fx', color: '#88ccff' },
        { var: 'wind.fz', label: 'fz', color: '#4488ff' },
      ],
    },
    {
      label: 'Track error',
      series: [
        { var: 'validator.currentErr', label: 'current err (m)', color: '#ffaa44' },
        { var: 'validator.accErr',     label: 'accumulated',     color: '#44aaff' },
      ],
    },
  ],
  };
}
