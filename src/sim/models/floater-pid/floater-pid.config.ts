import mission1Code from './blocks/mission1.ts?raw';
import { mission1 } from './blocks/mission1';
import mission2Code from './blocks/mission2.ts?raw';
import { mission2 } from './blocks/mission2';
import fc1Code from './blocks/fc1.ts?raw';
import { fc1 } from './blocks/fc1';
import fcPidCode from './blocks/fc_pid.ts?raw';
import { fc_pid } from './blocks/fc_pid';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import { createFloaterPidSceneHandler } from './floater-pid.scene';
import type { ModelConfig } from '../../engine/types';

export const floaterPidConfig: ModelConfig = {
  modelId: 'floater-pid',
  tickIntervalMs: 50,
  initialState: {
    x1: 0, y1: 0, z1: 0, vx1: 0, vy1: 0, vz1: 0, ax1: 0, ay1: 0, az1: 0,
    targetIdx1: 0, dist1: 0, targetX1: 0, targetY1: 0, targetZ1: 0,
    x2: 0, y2: 0, z2: 0, vx2: 0, vy2: 0, vz2: 0, ax2: 0, ay2: 0, az2: 0,
    targetIdx2: 0, dist2: 0, targetX2: 0, targetY2: 0, targetZ2: 0,
    ex2: 0, ey2: 0, ez2: 0,
  },
  blocks: [
    {
      sourceId: 'mission1',
      exportName: 'mission1',
      defaultFn: (s) => mission1(s as Parameters<typeof mission1>[0]),
      defaultCode: mission1Code,
      mapStateIn: (s) => ({ x1: s.x1, y1: s.y1, z1: s.z1, targetIdx1: s.targetIdx1 }),
      mapStateOut: (out, s) => ({ ...s, targetIdx1: out.targetIdx1, dist1: out.dist1, targetX1: out.targetX1, targetY1: out.targetY1, targetZ1: out.targetZ1 }),
      tickFrequency: 1,
    },
    {
      sourceId: 'mission2',
      exportName: 'mission2',
      defaultFn: (s) => mission2(s as Parameters<typeof mission2>[0]),
      defaultCode: mission2Code,
      mapStateIn: (s) => ({ x2: s.x2, y2: s.y2, z2: s.z2, targetIdx2: s.targetIdx2 }),
      mapStateOut: (out, s) => ({ ...s, targetIdx2: out.targetIdx2, dist2: out.dist2, targetX2: out.targetX2, targetY2: out.targetY2, targetZ2: out.targetZ2 }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc1',
      exportName: 'fc1',
      defaultFn: (s) => fc1(s as Parameters<typeof fc1>[0]),
      defaultCode: fc1Code,
      mapStateIn: (s) => ({ x: s.x1, y: s.y1, z: s.z1, vx: s.vx1, vy: s.vy1, vz: s.vz1, targetX: s.targetX1, targetY: s.targetY1, targetZ: s.targetZ1 }),
      mapStateOut: (out, s) => ({ ...s, ax1: out.ax, ay1: out.ay, az1: out.az }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_pid',
      exportName: 'fc_pid',
      defaultFn: (s) => fc_pid(s as Parameters<typeof fc_pid>[0]),
      defaultCode: fcPidCode,
      mapStateIn: (s) => ({ x: s.x2, y: s.y2, z: s.z2, vx: s.vx2, vy: s.vy2, vz: s.vz2, targetX: s.targetX2, targetY: s.targetY2, targetZ: s.targetZ2, ex: s.ex2, ey: s.ey2, ez: s.ez2 }),
      mapStateOut: (out, s) => ({ ...s, ax2: out.ax, ay2: out.ay, az2: out.az, ex2: out.ex, ey2: out.ey, ez2: out.ez }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world',
      exportName: 'world',
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s) => ({ x1: s.x1, y1: s.y1, z1: s.z1, vx1: s.vx1, vy1: s.vy1, vz1: s.vz1, ax1: s.ax1, ay1: s.ay1, az1: s.az1, x2: s.x2, y2: s.y2, z2: s.z2, vx2: s.vx2, vy2: s.vy2, vz2: s.vz2, ax2: s.ax2, ay2: s.ay2, az2: s.az2 }),
      mapStateOut: (out, s) => ({ ...s, x1: out.x1, y1: out.y1, z1: out.z1, vx1: out.vx1, vy1: out.vy1, vz1: out.vz1, x2: out.x2, y2: out.y2, z2: out.z2, vx2: out.vx2, vy2: out.vy2, vz2: out.vz2 }),
      tickFrequency: 1,
    },
  ],
  sceneHandler: createFloaterPidSceneHandler,
  charts: [
    {
      label: 'X Position',
      series: [
        { var: 'x1',       label: 'P  x',      color: '#e74c3c' },
        { var: 'targetX1', label: 'P  tgt-x',  color: '#f1948a' },
        { var: 'x2',       label: 'PID x',     color: '#2980b9' },
        { var: 'targetX2', label: 'PID tgt-x', color: '#85c1e9' },
      ],
    },
    {
      label: 'Y Position',
      series: [
        { var: 'y1',       label: 'P  y',      color: '#e74c3c' },
        { var: 'targetY1', label: 'P  tgt-y',  color: '#f1948a' },
        { var: 'y2',       label: 'PID y',     color: '#2980b9' },
        { var: 'targetY2', label: 'PID tgt-y', color: '#85c1e9' },
      ],
    },
    {
      label: 'Z Position',
      series: [
        { var: 'z1',       label: 'P  z',      color: '#e74c3c' },
        { var: 'targetZ1', label: 'P  tgt-z',  color: '#f1948a' },
        { var: 'z2',       label: 'PID z',     color: '#2980b9' },
        { var: 'targetZ2', label: 'PID tgt-z', color: '#85c1e9' },
      ],
    },
  ],
};
