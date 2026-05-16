import missionCode from './blocks/mission.ts?raw';
import fcCode from './blocks/fc.ts?raw';
import hwCode from './blocks/hw.ts?raw';
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

// Shared physical constants — must match values in blocks/*.ts
const MASS = 1.0;
const GRAVITY = 9.81;
const MAX_THRUST_N = 30;
const THRUST_RATE_N_PER_S = 60;
const DIR_RATE_RAD_PER_S = 3.0;
const DT = 0.05;

// FC gains
const K = 3.0;
const KV = 1.5;

export const floaterConfig: ModelConfig = {
  modelId: 'floater',
  tickIntervalMs: 50,
  initialState: {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    ax: 0, ay: 0, az: 0,
    tdx: 0, tdy: 0, tdz: 0,
    tx: 0, ty: 0, tz: 0,
    targetIdx: 0, dist: 0,
    targetX: 0, targetY: 5, targetZ: 0,
  },
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
      defaultFn: (s) => {
        const fx = MASS * (K * (s.targetX - s.x) - KV * s.vx);
        const fy = MASS * (K * (s.targetY - s.y) - KV * s.vy) + MASS * GRAVITY;
        const fz = MASS * (K * (s.targetZ - s.z) - KV * s.vz);
        const k = 100 / MAX_THRUST_N;
        return { tdx: fx * k, tdy: fy * k, tdz: fz * k };
      },
      defaultCode: fcCode,
      mapStateIn: (s) => ({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, targetX: s.targetX, targetY: s.targetY, targetZ: s.targetZ }),
      mapStateOut: (out, s) => ({ ...s, tdx: out.tdx, tdy: out.tdy, tdz: out.tdz }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw',
      exportName: 'hw',
      defaultFn: (s) => {
        const dx = (s.tdx / 100) * MAX_THRUST_N;
        const dy = (s.tdy / 100) * MAX_THRUST_N;
        const dz = (s.tdz / 100) * MAX_THRUST_N;
        const desMagRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const desMag = Math.min(MAX_THRUST_N, desMagRaw);
        const actMag = Math.sqrt(s.tx * s.tx + s.ty * s.ty + s.tz * s.tz);

        const maxDelta = THRUST_RATE_N_PER_S * DT;
        const newMag = actMag + Math.max(-maxDelta, Math.min(maxDelta, desMag - actMag));

        const desDir = desMagRaw > 1e-6
          ? [dx / desMagRaw, dy / desMagRaw, dz / desMagRaw]
          : null;
        const actDir = actMag > 1e-6
          ? [s.tx / actMag, s.ty / actMag, s.tz / actMag]
          : null;

        let newDir = desDir;
        if (actDir && desDir) {
          const dot = Math.max(-1, Math.min(1,
            actDir[0] * desDir[0] + actDir[1] * desDir[1] + actDir[2] * desDir[2]));
          const angle = Math.acos(dot);
          const maxRot = DIR_RATE_RAD_PER_S * DT;
          if (angle > maxRot && angle > 1e-6) {
            const t = maxRot / angle;
            const sinA = Math.sin(angle);
            const a = Math.sin((1 - t) * angle) / sinA;
            const b = Math.sin(t * angle) / sinA;
            newDir = [
              a * actDir[0] + b * desDir[0],
              a * actDir[1] + b * desDir[1],
              a * actDir[2] + b * desDir[2],
            ];
          }
        }

        if (!newDir) return { tx: 0, ty: 0, tz: 0 };
        return { tx: newDir[0] * newMag, ty: newDir[1] * newMag, tz: newDir[2] * newMag };
      },
      defaultCode: hwCode,
      mapStateIn: (s) => ({ tdx: s.tdx, tdy: s.tdy, tdz: s.tdz, tx: s.tx, ty: s.ty, tz: s.tz }),
      mapStateOut: (out, s) => ({ ...s, tx: out.tx, ty: out.ty, tz: out.tz }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world',
      exportName: 'world',
      defaultFn: (s) => {
        const ax = s.tx / MASS;
        const ay = (s.ty - MASS * GRAVITY) / MASS;
        const az = s.tz / MASS;
        let vx = s.vx + ax * DT;
        let vy = s.vy + ay * DT;
        let vz = s.vz + az * DT;
        let x = s.x + vx * DT;
        let y = s.y + vy * DT;
        let z = s.z + vz * DT;
        if (y < 0) { y = 0; vy = Math.abs(vy) * 0.3; }
        return { x, y, z, vx, vy, vz, ax, ay, az };
      },
      defaultCode: worldCode,
      mapStateIn: (s) => ({ x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, tx: s.tx, ty: s.ty, tz: s.tz }),
      mapStateOut: (out, s) => ({ ...s, x: out.x, y: out.y, z: out.z, vx: out.vx, vy: out.vy, vz: out.vz, ax: out.ax, ay: out.ay, az: out.az }),
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
    {
      label: 'Thrust actual (N)',
      series: [
        { var: 'tx', label: 'tx', color: '#ff6622' },
        { var: 'ty', label: 'ty', color: '#22cc66' },
        { var: 'tz', label: 'tz', color: '#4499ff' },
      ],
    },
  ],
};
