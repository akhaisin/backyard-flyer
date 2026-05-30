import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import plannerWpCode from './blocks/planner_wp.ts?raw';
import { planner_wp } from './blocks/planner_wp';
import navigatorWpCode from './blocks/navigator_wp.ts?raw';
import { navigator_wp } from './blocks/navigator_wp';
import plannercturnCode from './blocks/planner_cturn.ts?raw';
import { planner_cturn } from './blocks/planner_cturn';
import navigatorcturnCode from './blocks/navigator_cturn.ts?raw';
import { navigator_cturn } from './blocks/navigator_cturn';
import fcAcroCode from './blocks/fc_acro.ts?raw';
import { fc_acro } from './blocks/fc_acro';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import QuadPoleVis from './quad-pole.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

export const quadPoleConfig: ModelConfig = {
  modelId: 'racing/quad-pole',
  tickIntervalMs: 50,
  initialState: {
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
      step:         { pos: { x: 0, y: 3, z: 0 }, threshold: 0.4, durationTicks: 0, waypoints: [] },
      target:       { ...vec0 },
      missionType:  0,
      dist:         0,
    },
    planner_wp:    { carrot: { ...vec0 }, yawSetpoint: 0, stepStatus: 0 },
    planner_cturn: { thrust: 0, roll: 0, pitch: 0, yaw: 0, active: 0, stepStatus: 0 },
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
        stepIdx:      (s.mission as ModelState).stepIdx,
        ticksInPhase: (s.mission as ModelState).ticksInPhase,
        armed:        (s.mission as ModelState).armed,
        statusWp:     (s.planner_wp as ModelState).stepStatus,
        statusCturn:  (s.planner_cturn as ModelState).stepStatus,
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
          missionType:  out.missionType,
          dist:         out.dist,
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
        missionType: (s.mission as ModelState).missionType,
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
        missionType: (s.mission as ModelState).missionType,
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
      sourceId: 'planner_cturn',
      exportName: 'planner_cturn',
      defaultFn: (s) => planner_cturn(s as Parameters<typeof planner_cturn>[0]),
      defaultCode: plannercturnCode,
      mapStateIn: (s) => ({
        missionType:  (s.mission as ModelState).missionType,
        step:         (s.mission as ModelState).step,
        ticksInPhase: (s.mission as ModelState).ticksInPhase,
        armed:        (s.mission as ModelState).armed,
        phase:        (s.mission as ModelState).phase,
        attitude:     s.attitude,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner_cturn: out,
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_cturn',
      exportName: 'navigator_cturn',
      defaultFn: (s) => navigator_cturn(s as Parameters<typeof navigator_cturn>[0]),
      defaultCode: navigatorcturnCode,
      mapStateIn: (s) => ({
        planThrust: (s.planner_cturn as ModelState).thrust,
        planRoll:   (s.planner_cturn as ModelState).roll,
        planPitch:  (s.planner_cturn as ModelState).pitch,
        planYaw:    (s.planner_cturn as ModelState).yaw,
        planActive: (s.planner_cturn as ModelState).active,
        aetr:       s.aetr,
      }),
      mapStateOut: (out, s) => ({ ...s, aetr: out.aetr }),
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
        windFx:     0,
        windFz:     0,
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
  vis: QuadPoleVis,
  blocksDiagram: [
    { from: 'world',             to: 'mission',          label: 'pos'         },
    { from: 'world',             to: 'planner_wp',       label: 'pos'         },
    { from: 'world',             to: 'navigator_wp',     label: 'state'       },
    { from: 'world',             to: 'fc_acro',          label: 'rates'       },
    { from: 'mission',           to: 'planner_wp',       label: 'target+type' },
    { from: 'mission',           to: 'planner_cturn',   label: 'maneuverIdx' },
    { from: 'mission',           to: 'navigator_wp',     label: 'type'        },
    { from: 'planner_wp',        to: 'navigator_wp',     label: 'carrot+yaw'  },
    { from: 'planner_cturn',    to: 'navigator_cturn', label: 'plan'        },
    { from: 'navigator_wp',      to: 'navigator_cturn', label: 'aetr'        },
    { from: 'navigator_cturn',  to: 'fc_acro',          label: 'aetr'        },
    { from: 'fc_acro',           to: 'hw',               label: 'motors'      },
    { from: 'hw',                to: 'world',            label: 'thrust'      },
  ],
  charts: [
    {
      label: 'Mission',
      series: [
        { var: 'mission.phase',       label: 'phase',       color: '#ffaa00' },
        { var: 'mission.stepIdx',     label: 'stepIdx',     color: '#00ffaa' },
        { var: 'mission.missionType', label: 'missionType', color: '#ff66ff' },
        { var: 'mission.armed',       label: 'armed',       color: '#aaaaaa' },
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
  ],
};
