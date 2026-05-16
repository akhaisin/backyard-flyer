import missionCode from './blocks/mission.ts?raw';
import fcCode from './blocks/fc.ts?raw';
import hwCode from './blocks/hw.ts?raw';
import worldCode from './blocks/world.ts?raw';
import { createFloaterSceneHandler } from './floater.scene';
import type { ModelConfig, ModelState } from '../../engine/types';

type Vec3 = { x: number; y: number; z: number };

const WAYPOINTS: Vec3[] = [
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
const DIR_RATE_RAD_PER_S = 5.0;
const DT = 0.05;

// FC gains
const K = 3.0;
const KV = 1.5;

// Convenience: read a nested sub-tree as the typed shape the block expects.
// State is `Record<string, number | ModelState>` so accessing nested objects
// needs a single cast at the boundary.
const v3 = (s: ModelState, key: string): Vec3 => s[key] as unknown as Vec3;

export const floaterConfig: ModelConfig = {
  modelId: 'floater',
  tickIntervalMs: 50,
  initialState: {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    acc: { x: 0, y: 0, z: 0 },
    thrust: {
      desired: { x: 0, y: 0, z: 0 },
      actual: { x: 0, y: 0, z: 0 },
    },
    mission: {
      targetIdx: 0,
      dist: 0,
      target: { x: 0, y: 5, z: 0 },
    },
  },
  blocks: [
    {
      sourceId: 'mission',
      exportName: 'mission',
      defaultFn: (s) => {
        const pos = v3(s, 'pos');
        const idx = Math.round(s.targetIdx as number) % WAYPOINTS.length;
        const wp = WAYPOINTS[idx];
        const dx = wp.x - pos.x;
        const dy = wp.y - pos.y;
        const dz = wp.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < THRESHOLD) {
          const next = (idx + 1) % WAYPOINTS.length;
          const nwp = WAYPOINTS[next];
          return { targetIdx: next, dist, target: { x: nwp.x, y: nwp.y, z: nwp.z } };
        }
        return { targetIdx: idx, dist, target: { x: wp.x, y: wp.y, z: wp.z } };
      },
      defaultCode: missionCode,
      mapStateIn: (s) => ({
        pos: s.pos,
        targetIdx: (s.mission as ModelState).targetIdx,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        mission: {
          ...(s.mission as ModelState),
          targetIdx: out.targetIdx,
          dist: out.dist,
          target: out.target,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc',
      exportName: 'fc',
      defaultFn: (s) => {
        const pos = v3(s, 'pos');
        const vel = v3(s, 'vel');
        const target = s.target as unknown as Vec3;
        const fx = MASS * (K * (target.x - pos.x) - KV * vel.x);
        const fy = MASS * (K * (target.y - pos.y) - KV * vel.y) + MASS * GRAVITY;
        const fz = MASS * (K * (target.z - pos.z) - KV * vel.z);
        const k = 100 / MAX_THRUST_N;
        return { desired: { x: fx * k, y: fy * k, z: fz * k } };
      },
      defaultCode: fcCode,
      mapStateIn: (s) => ({
        pos: s.pos,
        vel: s.vel,
        target: (s.mission as ModelState).target,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        thrust: {
          ...(s.thrust as ModelState),
          desired: out.desired,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw',
      exportName: 'hw',
      defaultFn: (s) => {
        const desired = v3(s, 'desired');
        const actual = v3(s, 'actual');
        const dx = (desired.x / 100) * MAX_THRUST_N;
        const dy = (desired.y / 100) * MAX_THRUST_N;
        const dz = (desired.z / 100) * MAX_THRUST_N;
        const desMagRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const desMag = Math.min(MAX_THRUST_N, desMagRaw);
        const actMag = Math.sqrt(actual.x * actual.x + actual.y * actual.y + actual.z * actual.z);

        const maxDelta = THRUST_RATE_N_PER_S * DT;
        const newMag = actMag + Math.max(-maxDelta, Math.min(maxDelta, desMag - actMag));

        const desDir = desMagRaw > 1e-6
          ? [dx / desMagRaw, dy / desMagRaw, dz / desMagRaw]
          : null;
        const actDir = actMag > 1e-6
          ? [actual.x / actMag, actual.y / actMag, actual.z / actMag]
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

        if (!newDir) return { actual: { x: 0, y: 0, z: 0 } };
        return { actual: { x: newDir[0] * newMag, y: newDir[1] * newMag, z: newDir[2] * newMag } };
      },
      defaultCode: hwCode,
      mapStateIn: (s) => ({
        desired: (s.thrust as ModelState).desired,
        actual: (s.thrust as ModelState).actual,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        thrust: {
          ...(s.thrust as ModelState),
          actual: out.actual,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world',
      exportName: 'world',
      defaultFn: (s) => {
        const pos = v3(s, 'pos');
        const vel = v3(s, 'vel');
        const actual = v3(s, 'actual');
        const ax = actual.x / MASS;
        const ay = (actual.y - MASS * GRAVITY) / MASS;
        const az = actual.z / MASS;
        let vx = vel.x + ax * DT;
        let vy = vel.y + ay * DT;
        let vz = vel.z + az * DT;
        let x = pos.x + vx * DT;
        let y = pos.y + vy * DT;
        let z = pos.z + vz * DT;
        if (y < 0) { y = 0; vy = Math.abs(vy) * 0.3; }
        return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, acc: { x: ax, y: ay, z: az } };
      },
      defaultCode: worldCode,
      mapStateIn: (s) => ({
        pos: s.pos,
        vel: s.vel,
        actual: (s.thrust as ModelState).actual,
      }),
      mapStateOut: (out, s) => ({
        ...s,
        pos: out.pos,
        vel: out.vel,
        acc: out.acc,
      }),
      tickFrequency: 1,
    },
  ],
  sceneHandler: createFloaterSceneHandler,
  charts: [
    {
      label: 'Position',
      series: [
        { var: 'pos.x', label: 'x', color: '#ff4444' },
        { var: 'pos.y', label: 'y', color: '#44ff44' },
        { var: 'pos.z', label: 'z', color: '#4488ff' },
      ],
    },
    {
      label: 'Velocity',
      series: [
        { var: 'vel.x', label: 'vx', color: '#ff8888' },
        { var: 'vel.y', label: 'vy', color: '#88ff88' },
        { var: 'vel.z', label: 'vz', color: '#88aaff' },
      ],
    },
    {
      label: 'Thrust actual (N)',
      series: [
        { var: 'thrust.actual.x', label: 'tx', color: '#ff6622' },
        { var: 'thrust.actual.y', label: 'ty', color: '#22cc66' },
        { var: 'thrust.actual.z', label: 'tz', color: '#4499ff' },
      ],
    },
  ],
};
