import missionCode from './blocks/mission.ts?raw';
import fcCode from './blocks/fc.ts?raw';
import worldCode from './blocks/world.ts?raw';
import { createFloaterSceneHandler } from './floater.scene';
import type { ModelConfig } from '../../engine/types';

const WAYPOINTS = [
  { x: 0, y: 5, z: 0 },
  { x: 10, y: 5, z: 0 },
  { x: 10, y: 10, z: 10 },
  { x: 0, y: 5, z: 15 },
];

const THRESHOLD = 1.5;
const K = 3.0;
const DRAG = 1.5;
const GRAVITY = 9.81;
const MAX_ACC = 20.0;
const DT = 0.05;

function clamp(v: number): number {
  return Math.max(-MAX_ACC, Math.min(MAX_ACC, v));
}

export const floaterConfig: ModelConfig = {
  modelId: 'floater',
  tickIntervalMs: 50,
  initialState: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, targetIdx: 0, dist: 0, targetX: 0, targetY: 5, targetZ: 0 },
  blocks: [
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => {
        const idx = Math.round(s.targetIdx) % WAYPOINTS.length;
        const wp = WAYPOINTS[idx];
        const dx = wp.x - s.x;
        const dy = wp.y - s.y;
        const dz = wp.z - s.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < THRESHOLD) {
          const next = (idx + 1) % WAYPOINTS.length;
          const nwp = WAYPOINTS[next];
          return { targetIdx: next, dist, targetX: nwp.x, targetY: nwp.y, targetZ: nwp.z };
        }
        return { targetIdx: idx, dist, targetX: wp.x, targetY: wp.y, targetZ: wp.z };
      },
      defaultCode: missionCode,
      mapStateIn: (s) => ({ x: s.x, y: s.y, z: s.z, targetIdx: s.targetIdx }),
      mapStateOut: (out, s) => ({ ...s, targetIdx: out.targetIdx, dist: out.dist, targetX: out.targetX, targetY: out.targetY, targetZ: out.targetZ }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc',
      exportName: 'fc',
      defaultFn: (s) => ({
        ax: clamp((s.targetX - s.x) * K - s.vx * DRAG),
        ay: GRAVITY + clamp((s.targetY - s.y) * K - s.vy * DRAG),
        az: clamp((s.targetZ - s.z) * K - s.vz * DRAG),
      }),
      defaultCode: fcCode,
      mapStateIn: (s) => ({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, targetX: s.targetX, targetY: s.targetY, targetZ: s.targetZ }),
      mapStateOut: (out, s) => ({ ...s, ax: out.ax, ay: out.ay, az: out.az }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world',
      exportName: 'world',
      defaultFn: (s) => {
        let vx = s.vx + s.ax * DT;
        let vy = s.vy + (s.ay - GRAVITY) * DT;
        let vz = s.vz + s.az * DT;
        let x = s.x + vx * DT;
        let y = s.y + vy * DT;
        let z = s.z + vz * DT;
        if (y < 0) { y = 0; vy = Math.abs(vy) * 0.3; }
        return { x, y, z, vx, vy, vz };
      },
      defaultCode: worldCode,
      mapStateIn: (s) => ({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, ax: s.ax, ay: s.ay, az: s.az }),
      mapStateOut: (out, s) => ({ ...s, x: out.x, y: out.y, z: out.z, vx: out.vx, vy: out.vy, vz: out.vz }),
      tickFrequency: 1,
    },
  ],
  sceneHandler: createFloaterSceneHandler,
  charts: [
    {
      label: 'Position',
      series: [
        { var: 'x', label: 'x', color: '#ff4444' },
        { var: 'y', label: 'y', color: '#44ff44' },
        { var: 'z', label: 'z', color: '#4488ff' },
      ],
    },
    {
      label: 'Velocity',
      series: [
        { var: 'vx', label: 'vx', color: '#ff8888' },
        { var: 'vy', label: 'vy', color: '#88ff88' },
        { var: 'vz', label: 'vz', color: '#88aaff' },
      ],
    },
  ],
};
