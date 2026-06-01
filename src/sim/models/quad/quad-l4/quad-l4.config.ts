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
import worldCode from '../../lib/quad/world.ts?raw';
import { world } from '../../lib/quad/world';
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS } from '../../lib/quad/consts';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';
import QuadL4Vis from './quad-l4.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

export function quadL4Config(overrides?: Partial<QuadConsts>): ModelConfig {
  // The mission route — model-specific data, published into the params bag so
  // it's config-driven and editable in the lifecycle block UI (state.K.steps).
  const route: StepDef[] = [
    { pos: { x: 8, y: 5, z: 0 }, threshold: 1.2 },
    { pos: { x: 8, y: 5, z: 8 }, threshold: 1.2 },
    { pos: { x: 0, y: 5, z: 8 }, threshold: 1.2 },
    { pos: { x: 0, y: 5, z: 0 }, threshold: 1.2 },
  ];
  return {
  modelId: 'quad/quad-l4',
  tickIntervalMs: 50,
  initialState: {
    // K is provided by the static `params` block (engine static slice), not
    // dynamic state — so it's not duplicated into per-tick history.
    pos:        { ...vec0 },
    vel:        { ...vec0 },
    acc:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
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
    planner_wp: { carrot: { ...vec0 }, yawSetpoint: 0, stepStatus: 0 },
    validator: {
      prevPhase:  0,
      lapsTotal:  0,
      currentErr: 0,
      accErr:     0,
      passCount:  0,
      passTotal:  3,
      pass:      -1,   // -1 = still running; afterSim sets 1 (pass) / 0 (fail)
    },
  },
  blocks: [
    makeLifecycleBlock(QUAD_DEFAULTS, route, overrides),
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s) => ({
        pos:          s.pos,
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
        pos:         s.pos,
        step:        (s.mission as ModelState).step,
        armed:       (s.mission as ModelState).armed,
        phase:       (s.mission as ModelState).phase,
        yawSetpoint: (s.planner_wp as ModelState).yawSetpoint,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_wp: { carrot: out.carrot, yawSetpoint: out.yawSetpoint, stepStatus: out.stepStatus },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_wp',
      exportName: 'navigator_wp',
      defaultFn: (s) => navigator_wp(s as Parameters<typeof navigator_wp>[0]),
      defaultCode: navigatorWpCode,
      mapStateIn: (s) => ({
        pos:         s.pos,
        vel:         s.vel,
        attitude:    s.attitude,
        carrot:      (s.planner_wp as ModelState).carrot,
        yawSetpoint: (s.planner_wp as ModelState).yawSetpoint,
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
        angularVel: s.angularVel,
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
  vis: QuadL4Vis,
  blocksDiagram: [
    { from: 'lifecycle',    to: 'mission',      label: 'K'          },
    { from: 'world',        to: 'mission',      label: 'pos'        },
    { from: 'world',        to: 'planner_wp',   label: 'pos'        },
    { from: 'world',        to: 'navigator_wp', label: 'state'      },
    { from: 'world',        to: 'fc_acro',      label: 'rates'      },
    { from: 'mission',      to: 'planner_wp',   label: 'step'       },
    { from: 'planner_wp',   to: 'navigator_wp', label: 'carrot+yaw' },
    { from: 'planner_wp',   to: 'mission',      label: 'status'     },
    { from: 'navigator_wp', to: 'fc_acro',      label: 'aetr'       },
    { from: 'fc_acro',      to: 'hw',           label: 'motors'     },
    { from: 'hw',           to: 'world',        label: 'thrust'     },
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
      label: 'Position (m)',
      series: [
        { var: 'pos.x', label: 'x', color: '#ff4444' },
        { var: 'pos.y', label: 'y', color: '#44ff44' },
        { var: 'pos.z', label: 'z', color: '#4488ff' },
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
      label: 'Angular rates (rad/s)',
      series: [
        { var: 'angularVel.x', label: 'roll rate',  color: '#ff8844' },
        { var: 'angularVel.z', label: 'pitch rate', color: '#44ffaa' },
        { var: 'angularVel.y', label: 'yaw rate',   color: '#cc88ff' },
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
      label: 'Motor power (0–1)',
      series: [
        { var: 'motors.desired.m0', label: 'M0 FL', color: '#ff4444' },
        { var: 'motors.desired.m1', label: 'M1 FR', color: '#ffaa00' },
        { var: 'motors.desired.m2', label: 'M2 RR', color: '#44ff88' },
        { var: 'motors.desired.m3', label: 'M3 RL', color: '#4488ff' },
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
