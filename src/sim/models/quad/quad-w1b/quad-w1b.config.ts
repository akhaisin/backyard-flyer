import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import plannerWindowCode from './blocks/planner_window.ts?raw';
import { planner_window } from './blocks/planner_window';
import navigatorWindowCode from './blocks/navigator_window.ts?raw';
import { navigator_window } from './blocks/navigator_window';
import fcAcroCode from './blocks/fc_acro.ts?raw';
import { fc_acro } from './blocks/fc_acro';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import windCode from './blocks/wind.ts?raw';
import { wind } from './blocks/wind';
import noiseCode from './blocks/noise.ts?raw';
import { noise } from './blocks/noise';
import validatorCode from './blocks/validator.ts?raw';
import { validator } from './blocks/validator';
import QuadW1bVis from './quad-w1b.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

export const quadW1bConfig: ModelConfig = {
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
        center:       { x: 0, y: 5, z: 0 },
        normal:       { x: 1, y: 0, z: 0 },
        width:        5,
        height:       5,
        preStageDist: 5,
      },
      target:   { ...vec0 },
      dist:     0,
      segStart: { ...vec0 },
      segEnd:   { ...vec0 },
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
  },
  blocks: [
    {
      sourceId: 'wind',
      exportName: 'wind',
      defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
      defaultCode: windCode,
      mapStateIn:  (s) => s.wind as ModelState,
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
        statusWindow: (s.planner_window as ModelState).stepStatus,
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
      sourceId: 'planner_window',
      exportName: 'planner_window',
      defaultFn: (s) => planner_window(s as Parameters<typeof planner_window>[0]),
      defaultCode: plannerWindowCode,
      mapStateIn: (s) => ({
        pos:           (s.sensors as ModelState).pos,
        step:          (s.mission as ModelState).step,
        stepIdx:       (s.mission as ModelState).stepIdx,
        armed:         (s.mission as ModelState).armed,
        phase:         (s.mission as ModelState).phase,
        yawSetpoint:   (s.planner_window as ModelState).yawSetpoint,
        windowSide:    (s.planner_window as ModelState).windowSide,
        activeStepIdx: (s.planner_window as ModelState).activeStepIdx,
        preGateDone:   (s.planner_window as ModelState).preGateDone,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_window: {
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
      sourceId: 'navigator_window',
      exportName: 'navigator_window',
      defaultFn: (s) => navigator_window(s as Parameters<typeof navigator_window>[0]),
      defaultCode: navigatorWindowCode,
      mapStateIn: (s) => ({
        pos:         (s.sensors as ModelState).pos,
        vel:         (s.sensors as ModelState).vel,
        attitude:    (s.sensors as ModelState).attitude,
        carrot:      (s.planner_window as ModelState).carrot,
        yawSetpoint: (s.planner_window as ModelState).yawSetpoint,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
        aetr:        s.aetr,
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
    {
      sourceId: 'validator',
      exportName: 'validator',
      defaultFn: (s) => validator(s as Parameters<typeof validator>[0]),
      defaultCode: validatorCode,
      mapStateIn: (s) => ({
        pos:            s.pos,
        phase:          (s.mission as ModelState).phase,
        segStart:       (s.mission as ModelState).segStart,
        segEnd:         (s.mission as ModelState).segEnd,
        prevPhase:      (s.validator as ModelState).prevPhase,
        lapsTotal:      (s.validator as ModelState).lapsTotal,
        lapErrSum:      (s.validator as ModelState).lapErrSum,
        lapErrTicks:    (s.validator as ModelState).lapErrTicks,
        totalLapErrSum: (s.validator as ModelState).totalLapErrSum,
        misses:         (s.validator as ModelState).misses,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        validator: {
          ...(s.validator as ModelState),
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
  vis: QuadW1bVis,
  blocksDiagram: [
    { from: 'wind',             to: 'world',            label: 'force'      },
    { from: 'noise',            to: 'mission',          label: 'pos'        },
    { from: 'noise',            to: 'planner_window',   label: 'pos'        },
    { from: 'noise',            to: 'navigator_window', label: 'sensors'    },
    { from: 'noise',            to: 'fc_acro',          label: 'rates'      },
    { from: 'mission',          to: 'planner_window',   label: 'step'       },
    { from: 'mission',          to: 'validator',        label: 'phase+seg'  },
    { from: 'planner_window',   to: 'mission',          label: 'status'     },
    { from: 'planner_window',   to: 'navigator_window', label: 'carrot+yaw' },
    { from: 'navigator_window', to: 'fc_acro',          label: 'aetr'       },
    { from: 'fc_acro',          to: 'hw',               label: 'motors'     },
    { from: 'hw',               to: 'world',            label: 'thrust'     },
    { from: 'world',            to: 'noise',            label: 'true state' },
    { from: 'world',            to: 'validator',        label: 'pos'        },
  ],
  charts: [
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
        { var: 'pos.x',         label: 'x true',  color: '#ff4444' },
        { var: 'sensors.pos.x', label: 'x noisy', color: '#ff9999' },
        { var: 'pos.y',         label: 'y true',  color: '#44ff44' },
        { var: 'sensors.pos.y', label: 'y noisy', color: '#99ff99' },
        { var: 'pos.z',         label: 'z true',  color: '#4488ff' },
        { var: 'sensors.pos.z', label: 'z noisy', color: '#99ccff' },
      ],
    },
    {
      label: 'Carrot vs gate center',
      series: [
        { var: 'planner_window.carrot.x',  label: 'carrot x', color: '#ffee00' },
        { var: 'mission.step.center.x',    label: 'gate x',   color: '#ff8800' },
        { var: 'planner_window.carrot.z',  label: 'carrot z', color: '#aaee00' },
        { var: 'mission.step.center.z',    label: 'gate z',   color: '#88aa00' },
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
      label: 'Mission',
      series: [
        { var: 'mission.phase',   label: 'phase',   color: '#ffaa00' },
        { var: 'mission.stepIdx', label: 'stepIdx', color: '#00ffaa' },
        { var: 'mission.dist',    label: 'dist',    color: '#ff66ff' },
        { var: 'mission.armed',   label: 'armed',   color: '#aaaaaa' },
      ],
    },
    {
      label: 'Pre-gate latch',
      series: [
        { var: 'planner_window.preGateDone', label: 'preGateDone', color: '#ffaa00' },
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
      label: 'Track error (m)',
      series: [
        { var: 'validator.currentErr', label: 'current err', color: '#ffaa44' },
        { var: 'validator.lapErr',     label: 'lap err',     color: '#ff8888' },
        { var: 'validator.avgErr',     label: 'avg err',     color: '#44aaff' },
        { var: 'validator.misses',     label: 'misses',      color: '#ff66ff' },
      ],
    },
  ],
};
