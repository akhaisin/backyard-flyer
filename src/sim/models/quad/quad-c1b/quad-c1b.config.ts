import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
import targetC1Code from '../../lib/quad/target_c1.ts?raw';
import { target_c1 } from '../../lib/quad/target_c1';
import plannerC1bCode from '../../lib/quad/planner_c1b.ts?raw';
import { planner_c1b } from '../../lib/quad/planner_c1b';
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
import { C1B_ROUTE } from './route';
import QuadC1bVis from './quad-c1b.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

const STEP0_POS = C1B_ROUTE[0].pos;

export function quadC1bConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const modelOverrides: Partial<QuadConsts> = {
    KI_POS:        0.3,
    MAX_TILT:      0.4,
    KP_YAW_OUTER:  5.0,
    YAW_MEAS_LPF:  0.35,
    ACC_ERR_LIMIT: 999999,
    MAX_RESTARTS:  15,
    REQUIRED_LAPS: 2,
    MAX_TICKS:     6000,
    simDuration:   8000,
    ...overrides,
  };

  return {
    modelId: 'quad/quad-c1b',
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
        step: {
          pos:          { ...STEP0_POS },
          stepType:     5,
          dest:         { ...C1B_ROUTE[0].dest },
          speed:        C1B_ROUTE[0].speed,
          threshold:    C1B_ROUTE[0].threshold,
          preStageDist: C1B_ROUTE[0].preStageDist ?? 0,
        },
        target:   { ...vec0 },
        dist:     0,
        segStart: { ...vec0 },
        segEnd:   { ...STEP0_POS },
      },
      target_c1: {
        pos:           { ...STEP0_POS },
        phase:         0,
        activeStepIdx: -1,
      },
      planner_c1b: {
        carrot:      { ...STEP0_POS },
        yawSetpoint: 0,
        stepStatus:  0,
        preGateDone: 0,
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
      makeLifecycleBlock(QUAD_DEFAULTS, C1B_ROUTE, modelOverrides),
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
          statusWp:     (s.planner_c1b as ModelState).stepStatus,
          statusReturn: (s.planner_wp as ModelState).stepStatus,
          K: { ...(s.K as ModelState), steps: [((s.K as ModelState).steps as ModelState[])[0]] },
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
        sourceId: 'target_c1',
        exportName: 'target_c1',
        defaultFn: (s) => target_c1(s as Parameters<typeof target_c1>[0]),
        defaultCode: targetC1Code,
        mapStateIn: (s) => ({
          missionPhase:  (s.mission as ModelState).phase,
          activeStepIdx: (s.target_c1 as ModelState).activeStepIdx,
          pos:           (s.target_c1 as ModelState).pos,
          phase:         (s.target_c1 as ModelState).phase,
          K:             s.K,
        }),
        mapStateOut: (out, s) => ({ ...s, target_c1: out }),
        tickFrequency: 1,
      },
      {
        sourceId: 'planner_c1b',
        exportName: 'planner_c1b',
        defaultFn: (s) => planner_c1b(s as Parameters<typeof planner_c1b>[0]),
        defaultCode: plannerC1bCode,
        mapStateIn: (s) => ({
          pos:         (s.sensors as ModelState).pos,
          targetPos:   (s.target_c1 as ModelState).pos,
          targetPhase: (s.target_c1 as ModelState).phase,
          step:        (s.mission as ModelState).step,
          armed:       (s.mission as ModelState).armed,
          phase:       (s.mission as ModelState).phase,
          yawSetpoint: (s.planner_c1b as ModelState).yawSetpoint,
          preGateDone: (s.planner_c1b as ModelState).preGateDone,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          planner_c1b: {
            carrot:      out.carrot,
            yawSetpoint: out.yawSetpoint,
            stepStatus:  out.stepStatus,
            preGateDone: out.preGateDone,
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
          carrot:      (s.planner_c1b as ModelState).carrot,
          yawSetpoint: (s.planner_c1b as ModelState).yawSetpoint,
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
          angularVel:   (s.sensors as ModelState).angularVel,
          armed:        (s.mission as ModelState).armed,
          aetrThrottle: (s.aetr as ModelState).throttle,
          aetrRoll:     (s.aetr as ModelState).roll,
          aetrPitch:    (s.aetr as ModelState).pitch,
          aetrYaw:      (s.aetr as ModelState).yaw,
          K:            s.K,
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
    ],
    vis: QuadC1bVis,
    blocksDiagram: [
      { from: 'lifecycle',    to: 'wind',          label: 'K'             },
      { from: 'wind',         to: 'world',         label: 'force'         },
      { from: 'noise',        to: 'mission',       label: 'pos'           },
      { from: 'noise',        to: 'target_c1',     label: '—'             },
      { from: 'noise',        to: 'planner_c1b',   label: 'pos'           },
      { from: 'noise',        to: 'navigator_w1',  label: 'sensors'       },
      { from: 'noise',        to: 'fc_acro',       label: 'rates'         },
      { from: 'mission',      to: 'target_c1',     label: 'phase'         },
      { from: 'mission',      to: 'planner_c1b',   label: 'step/phase'    },
      { from: 'target_c1',    to: 'planner_c1b',   label: 'target pos'    },
      { from: 'planner_c1b',  to: 'mission',       label: 'status'        },
      { from: 'mission',      to: 'planner_wp',    label: 'anchor'        },
      { from: 'planner_wp',   to: 'mission',       label: 'return'        },
      { from: 'planner_c1b',  to: 'navigator_w1',  label: 'carrot+yaw'   },
      { from: 'navigator_w1', to: 'fc_acro',       label: 'aetr'          },
      { from: 'fc_acro',      to: 'hw',            label: 'motors'        },
      { from: 'hw',           to: 'world',         label: 'throttle'      },
      { from: 'world',        to: 'noise',         label: 'true state'    },
    ],
    charts: [
      {
        label: 'Mission',
        series: [
          { var: 'mission.phase',         label: 'phase',       color: '#ffaa00' },
          { var: 'mission.armed',          label: 'armed',       color: '#aaaaaa' },
          { var: 'planner_c1b.preGateDone', label: 'staged',    color: '#44ffcc' },
          { var: 'validator.restarts',     label: 'restarts',    color: '#ff66ff' },
        ],
      },
      {
        label: 'Target phase',
        series: [
          { var: 'target_c1.phase', label: 'target phase (0=idle 1=moving 2=lapped)', color: '#ff8800' },
        ],
      },
      {
        label: 'Distance to target (m)',
        series: [{
          label: 'dist to target',
          color: '#ff4488',
          fn: (s) => {
            const qp = s.pos as ModelState;
            const tp = (s.target_c1 as ModelState).pos as ModelState;
            const dx = (qp.x as number) - (tp.x as number);
            const dy = (qp.y as number) - (tp.y as number);
            const dz = (qp.z as number) - (tp.z as number);
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
          },
        }],
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
        label: 'Position (XZ)',
        series: [
          { var: 'pos.x',           label: 'quad x',   color: '#ff4444' },
          { var: 'pos.z',           label: 'quad z',   color: '#4488ff' },
          { var: 'target_c1.pos.x', label: 'target x', color: '#ff8800' },
          { var: 'target_c1.pos.z', label: 'target z', color: '#ffcc44' },
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
          { var: 'aetr.roll',     label: 'roll',     color: '#ff8844' },
          { var: 'aetr.pitch',    label: 'pitch',    color: '#44ffaa' },
          { var: 'aetr.yaw',      label: 'yaw',      color: '#cc88ff' },
        ],
      },
    ],
  };
}
