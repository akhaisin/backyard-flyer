import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import fcPathPlannerCode from './blocks/fc_path_planner.ts?raw';
import { fc_path_planner } from './blocks/fc_path_planner';
import fcNavigatorCode from './blocks/fc_navigator.ts?raw';
import { fc_navigator } from './blocks/fc_navigator';
import fcStabilizerCode from './blocks/fc_stabilizer.ts?raw';
import { fc_stabilizer } from './blocks/fc_stabilizer';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import windCode from './blocks/wind.ts?raw';
import { wind } from './blocks/wind';
import noiseCode from './blocks/noise.ts?raw';
import { noise } from './blocks/noise';
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
      nav: { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0 },
      integral: {
        pos: { ...vec0 },
        att: { ...vec0 },
      },
    },
    motors: {
      desired: { ...motors0 },
      thrust:  { ...motors0 },
    },
    mission: {
      phase:        0,
      windowIdx:    0,
      ticksInPhase: 0,
      armed:        0,
      windowSide:   0,
      windowCenter: { ...vec0 },
      windowNormal: { x: 1, y: 0, z: 0 },
      dist:         0,
    },
    planner: {
      carrot:          { ...vec0 },
      preGateDone:     0,
      activeWindowIdx: -1,
      yawSetpoint:     0,
    },
  },
  blocks: [
    // --- Environment ---
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

    // --- Flight stack (reads noisy sensors) ---
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s) => ({
        pos:          (s.sensors as ModelState).pos,
        phase:        (s.mission as ModelState).phase,
        windowIdx:    (s.mission as ModelState).windowIdx,
        ticksInPhase: (s.mission as ModelState).ticksInPhase,
        armed:        (s.mission as ModelState).armed,
        windowSide:   (s.mission as ModelState).windowSide,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        mission: {
          ...(s.mission as ModelState),
          phase:        out.phase,
          windowIdx:    out.windowIdx,
          ticksInPhase: out.ticksInPhase,
          armed:        out.armed,
          windowSide:   out.windowSide,
          windowCenter: out.windowCenter,
          windowNormal: out.windowNormal,
          dist:         out.dist,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_path_planner',
      exportName: 'fc_path_planner',
      defaultFn: (s) => fc_path_planner(s as Parameters<typeof fc_path_planner>[0]),
      defaultCode: fcPathPlannerCode,
      mapStateIn: (s) => ({
        pos:             (s.sensors as ModelState).pos,
        windowCenter:    (s.mission as ModelState).windowCenter,
        windowNormal:    (s.mission as ModelState).windowNormal,
        windowIdx:       (s.mission as ModelState).windowIdx,
        armed:           (s.mission as ModelState).armed,
        phase:           (s.mission as ModelState).phase,
        preGateDone:     (s.planner as ModelState).preGateDone,
        activeWindowIdx: (s.planner as ModelState).activeWindowIdx,
        yawSetpoint:     (s.planner as ModelState).yawSetpoint,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        planner: { carrot: out.carrot, preGateDone: out.preGateDone, activeWindowIdx: out.activeWindowIdx, yawSetpoint: out.yawSetpoint },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_navigator',
      exportName: 'fc_navigator',
      defaultFn: (s) => fc_navigator(s as Parameters<typeof fc_navigator>[0]),
      defaultCode: fcNavigatorCode,
      mapStateIn: (s) => ({
        pos:         (s.sensors as ModelState).pos,
        vel:         (s.sensors as ModelState).vel,
        attitude:    (s.sensors as ModelState).attitude,
        carrot:      (s.planner as ModelState).carrot,
        armed:       (s.mission as ModelState).armed,
        integralPos: ((s.fc as ModelState).integral as ModelState).pos,
        yawSetpoint: (s.planner as ModelState).yawSetpoint,
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
        attitude:    (s.sensors as ModelState).attitude,
        angularVel:  (s.sensors as ModelState).angularVel,
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
  ],
  vis: QuadW1bVis,
  blocksDiagram: [
    { from: 'wind',            to: 'world',           label: 'force'     },
    { from: 'noise',           to: 'mission',         label: 'pos'       },
    { from: 'noise',           to: 'fc_path_planner', label: 'pos'       },
    { from: 'noise',           to: 'fc_navigator',    label: 'sensors'   },
    { from: 'noise',           to: 'fc_stabilizer',   label: 'sensors'   },
    { from: 'mission',         to: 'fc_path_planner', label: 'window'    },
    { from: 'fc_path_planner', to: 'fc_navigator',    label: 'carrot'    },
    { from: 'fc_navigator',    to: 'fc_stabilizer',   label: 'att cmd'   },
    { from: 'fc_stabilizer',   to: 'hw',              label: 'motors'    },
    { from: 'hw',              to: 'world',           label: 'thrust'    },
    { from: 'world',           to: 'noise',           label: 'true state' },
    { from: 'world',           to: 'mission',         label: 'pos'       },
    { from: 'world',           to: 'fc_path_planner', label: 'state'     },
    { from: 'world',           to: 'fc_stabilizer',   label: 'attitude'  },
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
      label: 'Carrot vs window center',
      series: [
        { var: 'planner.carrot.x',        label: 'carrot x',  color: '#ffee00' },
        { var: 'mission.windowCenter.x',  label: 'window x',  color: '#ff8800' },
        { var: 'planner.carrot.z',        label: 'carrot z',  color: '#aaee00' },
        { var: 'mission.windowCenter.z',  label: 'window z',  color: '#88aa00' },
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
        { var: 'mission.phase',     label: 'phase',     color: '#ffaa00' },
        { var: 'mission.dist',      label: 'dist',      color: '#ff66ff' },
        { var: 'mission.windowIdx', label: 'windowIdx', color: '#00ffaa' },
        { var: 'mission.armed',     label: 'armed',     color: '#aaaaaa' },
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
