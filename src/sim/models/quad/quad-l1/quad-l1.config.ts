import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import fcCode from './blocks/fc.ts?raw';
import { fc } from './blocks/fc';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import QuadVis from '../quad.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };

export const quadL1Config: ModelConfig = {
  modelId: 'quad/quad-l1',
  tickIntervalMs: 50,
  initialState: {
    pos:        { x: 0, y: 0, z: 0 },
    vel:        { x: 0, y: 0, z: 0 },
    acc:        { x: 0, y: 0, z: 0 },
    attitude:   { x: 0, y: 0, z: 0 },   // roll(x), yaw(y), pitch(z) in radians
    angularVel: { x: 0, y: 0, z: 0 },   // rad/s, body frame
    fc: {
      integral: {
        pos: { x: 0, y: 0, z: 0 },  // position error accumulator (m·s)
        att: { x: 0, y: 0, z: 0 },  // attitude error accumulator (rad·s)
      },
    },
    motors: {
      desired: { ...motors0 },   // FC output  (0–1 per motor)
      thrust:  { ...motors0 },   // HW output  (N per motor)
    },
    mission: {
      phase: 0,
      waypointIdx: 0,
      ticksInPhase: 0,
      armed: 0,
      dist: 0,
      target: { x: 0, y: 0, z: 0 },
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
          dist:         out.dist,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc',
      exportName: 'fc',
      defaultFn: (s) => fc(s as Parameters<typeof fc>[0]),
      defaultCode: fcCode,
      mapStateIn: (s) => ({
        pos:         s.pos,
        vel:         s.vel,
        attitude:    s.attitude,
        angularVel:  s.angularVel,
        target:      (s.mission as ModelState).target,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
        integralAtt: ((s.fc as ModelState).integral as ModelState).att,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        fc: {
          ...(s.fc as ModelState),
          integral: { pos: out.integralPos, att: out.integralAtt },
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
  ],
  vis: QuadVis,
  blocksDiagram: [
    { from: 'mission', to: 'fc',      label: 'target'  },
    { from: 'fc',      to: 'hw',      label: 'motors'  },
    { from: 'hw',      to: 'world',   label: 'thrust'  },
    { from: 'world',   to: 'mission', label: 'pos'     },
    { from: 'world',   to: 'fc',      label: 'state'   },
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
      label: 'Attitude (rad)',
      series: [
        { var: 'attitude.x', label: 'roll',  color: '#ff8844' },
        { var: 'attitude.z', label: 'pitch', color: '#44ffaa' },
        { var: 'attitude.y', label: 'yaw',   color: '#cc88ff' },
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
  ],
};
