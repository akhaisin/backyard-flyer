import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import fcNavigatorCode from './blocks/fc_navigator.ts?raw';
import { fc_navigator } from './blocks/fc_navigator';
import fcStabilizerCode from './blocks/fc_stabilizer.ts?raw';
import { fc_stabilizer } from './blocks/fc_stabilizer';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import validatorCode from './blocks/validator.ts?raw';
import { validator } from './blocks/validator';
import QuadVis from './quad-l3.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };

export const quadL3Config: ModelConfig = {
  modelId: 'quad/quad-l3',
  tickIntervalMs: 50,
  initialState: {
    pos:        { x: 0, y: 0, z: 0 },
    vel:        { x: 0, y: 0, z: 0 },
    acc:        { x: 0, y: 0, z: 0 },
    attitude:   { x: 0, y: 0, z: 0 },   // roll(x), yaw(y), pitch(z) in radians
    angularVel: { x: 0, y: 0, z: 0 },   // rad/s, body frame
    fc: {
      nav: { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0 },
      integral: {
        pos: { x: 0, y: 0, z: 0 },  // navigator position error accumulator (m·s)
        att: { x: 0, y: 0, z: 0 },  // stabilizer attitude error accumulator (rad·s)
      },
    },
    motors: {
      desired: { ...motors0 },   // stabilizer output (0–1 per motor)
      thrust:  { ...motors0 },   // HW output (N per motor)
    },
    mission: {
      phase: 0,
      waypointIdx: 0,
      ticksInPhase: 0,
      armed: 0,
      dist: 0,
      target:   { x: 0, y: 0, z: 0 },
      segStart: { x: 0, y: 0, z: 0 },
      segEnd:   { x: 0, y: 0, z: 0 },
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
    },
  },
  blocks: [
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s) => ({
        pos:          s.pos,
        phase:        (s.mission as ModelState).phase,
        waypointIdx:  (s.mission as ModelState).waypointIdx,
        ticksInPhase: (s.mission as ModelState).ticksInPhase,
        armed:        (s.mission as ModelState).armed,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        mission: {
          ...(s.mission as ModelState),
          phase:        out.phase,
          waypointIdx:  out.waypointIdx,
          ticksInPhase: out.ticksInPhase,
          armed:        out.armed,
          target:       out.target,
          segStart:     out.segStart,
          segEnd:       out.segEnd,
          dist:         out.dist,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_navigator',
      exportName: 'fc_navigator',
      defaultFn: (s) => fc_navigator(s as Parameters<typeof fc_navigator>[0]),
      defaultCode: fcNavigatorCode,
      mapStateIn: (s) => ({
        pos:         s.pos,
        vel:         s.vel,
        attitude:    s.attitude,
        target:      (s.mission as ModelState).target,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        fc: {
          ...(s.fc as ModelState),
          nav: { roll_des: out.roll_des, pitch_des: out.pitch_des, yaw_des: out.yaw_des, thrust: out.thrust },
          integral: {
            ...(((s.fc as ModelState).integral) as ModelState),
            pos: out.integralPos,
          },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_stabilizer',
      exportName: 'fc_stabilizer',
      defaultFn: (s) => fc_stabilizer(s as Parameters<typeof fc_stabilizer>[0]),
      defaultCode: fcStabilizerCode,
      mapStateIn: (s) => ({
        attitude:    s.attitude,
        angularVel:  s.angularVel,
        roll_des:    ((s.fc as ModelState).nav as ModelState).roll_des,
        pitch_des:   ((s.fc as ModelState).nav as ModelState).pitch_des,
        yaw_des:     ((s.fc as ModelState).nav as ModelState).yaw_des,
        thrust:      ((s.fc as ModelState).nav as ModelState).thrust,
        armed:       (s.mission as ModelState).armed,
        integralAtt: ((s.fc as ModelState).integral as ModelState).att,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        fc: {
          ...(s.fc as ModelState),
          integral: {
            ...(((s.fc as ModelState).integral) as ModelState),
            att: out.integralAtt,
          },
        },
        motors: {
          ...(s.motors as ModelState),
          desired: out.motors,
        },
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
        motors: {
          ...(s.motors as ModelState),
          thrust: out.thrust,
        },
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
        },
      }),
      tickFrequency: 1,
    },
  ],
  vis: QuadVis,
  blocksDiagram: [
    { from: 'mission',       to: 'fc_navigator',  label: 'target'      },
    { from: 'fc_navigator',  to: 'fc_stabilizer', label: 'att cmd'     },
    { from: 'fc_stabilizer', to: 'hw',            label: 'motors'      },
    { from: 'hw',            to: 'world',         label: 'thrust'      },
    { from: 'world',         to: 'mission',       label: 'pos'         },
    { from: 'world',         to: 'fc_navigator',  label: 'state'       },
    { from: 'world',         to: 'fc_stabilizer', label: 'attitude'    },
    { from: 'world',         to: 'validator',     label: 'pos'         },
    { from: 'mission',       to: 'validator',     label: 'phase+seg'   },
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
      label: 'Position',
      series: [
        { var: 'pos.x', label: 'x',   color: '#ff4444' },
        { var: 'pos.y', label: 'alt', color: '#44ff44' },
        { var: 'pos.z', label: 'z',   color: '#4488ff' },
      ],
    },
    {
      label: 'Yaw tracking (rad)',
      series: [
        { var: 'fc.nav.yaw_des',   label: 'yaw_des',      color: '#ffdd44' },
        { var: 'attitude.y',       label: 'yaw (actual)', color: '#cc88ff' },
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
      label: 'Navigator output (orientation)',
      series: [
        { var: 'fc.nav.roll_des',  label: 'roll_des',  color: '#ff8844' },
        { var: 'fc.nav.pitch_des', label: 'pitch_des', color: '#44ffaa' },
        { var: 'fc.nav.yaw_des',   label: 'yaw_des',   color: '#cc88ff' },
      ],
    },
    {
      label: 'Navigator output (thrust)',
      series: [
        { var: 'fc.nav.thrust', label: 'thrust', color: '#ffdd44' },
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
        { var: 'mission.phase', label: 'phase', color: '#ffaa00' },
        { var: 'mission.dist',  label: 'dist',  color: '#ff66ff' },
        { var: 'mission.armed', label: 'armed', color: '#00ffaa' },
      ],
    },
    {
      label: 'Track error (m)',
      series: [
        { var: 'validator.currentErr', label: 'current err', color: '#ffaa44' },
        { var: 'validator.lapErr',     label: 'lap err',     color: '#ff8888' },
        { var: 'validator.avgErr',     label: 'avg err',     color: '#44aaff' },
      ],
    },
  ],
};
