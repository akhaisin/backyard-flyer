import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
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
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS } from '../../lib/quad/consts';
import type { QuadConsts } from '../../lib/quad/consts';
import { W1B_ROUTE } from './route';
import QuadW1bVis from './quad-w1b.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

export function quadW1bConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const modelOverrides: Partial<QuadConsts> = {
    // Same flight tuning as w1a — gate runs want wind rejection + a touch more
    // tilt authority, and the softened/filtered yaw loop. w1b's distinction is
    // the pre-stage approach (route preStageDist + planner_w1b), not the gains.
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
  modelId: 'quad/quad-w1b',
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
      yawMeas:  0,
    },
    aetr:           { throttle: 0, roll: 0, pitch: 0, yaw: 0 },
    motors: {
      desired: { ...motors0 },
      thrust:  { ...motors0 },
    },
    mission: {
      phase:        0,
      stepIdx:      0,
      ticksInPhase: 0,
      armed:        0,
      step:         { pos: { x: 0, y: 5, z: 0 }, normal: { x: 1, y: 0, z: 0 }, width: 5, height: 5, preStageDist: 5 },
      target:       { ...vec0 },
      dist:         0,
      segStart:     { ...vec0 },
      segEnd:       { ...vec0 },
    },
    planner_w1b: {
      carrot:        { ...vec0 },
      yawSetpoint:   0,
      stepStatus:    0,
      windowSide:    0,
      activeStepIdx: -1,
      preGateDone:   0,
    },
    planner_wp: {
      stepStatus: 0,
    },
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
  },
  blocks: [
    makeLifecycleBlock(QUAD_DEFAULTS, W1B_ROUTE, modelOverrides),
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
        statusWp:     (s.planner_w1b as ModelState).stepStatus,
        statusReturn: (s.planner_wp as ModelState).stepStatus,
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
      sourceId: 'planner_w1b',
      exportName: 'planner_w1b',
      defaultFn: (s) => planner_w1b(s as Parameters<typeof planner_w1b>[0]),
      defaultCode: plannerW1bCode,
      mapStateIn: (s) => ({
        pos:           (s.sensors as ModelState).pos,
        step:          (s.mission as ModelState).step,
        stepIdx:       (s.mission as ModelState).stepIdx,
        armed:         (s.mission as ModelState).armed,
        phase:         (s.mission as ModelState).phase,
        yawSetpoint:   (s.planner_w1b as ModelState).yawSetpoint,
        windowSide:    (s.planner_w1b as ModelState).windowSide,
        activeStepIdx: (s.planner_w1b as ModelState).activeStepIdx,
        preGateDone:   (s.planner_w1b as ModelState).preGateDone,
        K:             s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_w1b: {
          carrot:        out.carrot,
          yawSetpoint:   out.yawSetpoint,
          stepStatus:    out.stepStatus,
          windowSide:    out.windowSide,
          activeStepIdx: out.activeStepIdx,
          preGateDone:   out.preGateDone,
        },
      }),
      tickFrequency: 1,
    },
    {
      // Recovery-waypoint completion checker (PHASE_RESTART arrival). See w1a.
      sourceId: 'planner_wp',
      exportName: 'planner_wp',
      defaultFn: (s) => planner_wp(s as Parameters<typeof planner_wp>[0]),
      defaultCode: plannerWpCode,
      mapStateIn: (s) => ({
        pos:   (s.sensors as ModelState).pos,
        step:  (s.mission as ModelState).step,
        armed: (s.mission as ModelState).armed,
        phase: (s.mission as ModelState).phase,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_wp: { stepStatus: out.stepStatus },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_w1',
      exportName: 'navigator_w1',
      defaultFn: (s) => navigator_w1(s as Parameters<typeof navigator_w1>[0]),
      defaultCode: navigatorW1Code,
      mapStateIn: (s) => ({
        pos:         (s.sensors as ModelState).pos,
        vel:         (s.sensors as ModelState).vel,
        attitude:    (s.sensors as ModelState).attitude,
        carrot:      (s.planner_w1b as ModelState).carrot,
        yawSetpoint: (s.planner_w1b as ModelState).yawSetpoint,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
        yawMeas:     (s.fc as ModelState).yawMeas,
        aetr:        s.aetr,
        K:           s.K,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        aetr: out.aetr,
        fc: {
          ...(s.fc as ModelState),
          integral: { ...(((s.fc as ModelState).integral) as ModelState), pos: out.integralPos },
          yawMeas:  out.yawMeas,
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
        aetrThrottle: (s.aetr as ModelState).throttle,
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
  vis: QuadW1bVis,
  blocksDiagram: [
    { from: 'lifecycle',     to: 'mission',       label: 'K'          },
    { from: 'wind',          to: 'world',         label: 'force'      },
    { from: 'noise',         to: 'mission',       label: 'pos'        },
    { from: 'noise',         to: 'planner_w1b',   label: 'pos'        },
    { from: 'noise',         to: 'navigator_w1',  label: 'sensors'    },
    { from: 'noise',         to: 'fc_acro',       label: 'rates'      },
    { from: 'mission',       to: 'planner_w1b',   label: 'step'       },
    { from: 'planner_w1b',   to: 'mission',       label: 'status'     },
    { from: 'mission',       to: 'planner_wp',    label: 'anchor'     },
    { from: 'planner_wp',    to: 'mission',       label: 'return'     },
    { from: 'planner_w1b',   to: 'navigator_w1',  label: 'carrot+yaw' },
    { from: 'navigator_w1',  to: 'fc_acro',       label: 'aetr'       },
    { from: 'fc_acro',       to: 'hw',            label: 'motors'     },
    { from: 'hw',            to: 'world',         label: 'throttle'     },
    { from: 'world',         to: 'noise',         label: 'true state' },
  ],
  charts: [
    {
      label: 'Mission',
      series: [
        { var: 'mission.phase',          label: 'phase',       color: '#ffaa00' },
        { var: 'mission.stepIdx',        label: 'stepIdx',     color: '#00ffaa' },
        { var: 'mission.armed',          label: 'armed',       color: '#aaaaaa' },
        { var: 'validator.restarts',     label: 'restarts',    color: '#ff66ff' },
        { var: 'planner_w1b.preGateDone', label: 'preGateDone', color: '#66ccff' },
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
      label: 'Carrot vs gate center',
      series: [
        { var: 'planner_w1b.carrot.x', label: 'carrot x', color: '#ffee00' },
        { var: 'mission.step.pos.x',   label: 'gate x',   color: '#ff8800' },
        { var: 'planner_w1b.carrot.z', label: 'carrot z', color: '#aaee00' },
        { var: 'mission.step.pos.z',   label: 'gate z',   color: '#88aa00' },
      ],
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
        { var: 'aetr.throttle', label: 'throttle', color: '#ffee44' },
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
