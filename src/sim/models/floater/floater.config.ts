import missionCode from './blocks/mission.ts?raw';
import { mission } from './blocks/mission';
import fcCode from './blocks/fc.ts?raw';
import { fc } from './blocks/fc';
import hwCode from './blocks/hw.ts?raw';
import { hw } from './blocks/hw';
import worldCode from './blocks/world.ts?raw';
import { world } from './blocks/world';
import { createFloaterSceneHandler } from './floater.scene';
import type { ModelConfig, ModelState } from '../../engine/types';

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
      defaultFn: (s) => mission(s as Parameters<typeof mission>[0]),
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
      defaultFn: (s) => fc(s as Parameters<typeof fc>[0]),
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
      defaultFn: (s) => hw(s as Parameters<typeof hw>[0]),
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
      defaultFn: (s) => world(s as Parameters<typeof world>[0]),
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
