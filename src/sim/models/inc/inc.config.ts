import incCode from './blocks/inc.ts?raw';
import { createIncSceneHandler } from './inc.scene';
import type { ModelConfig } from '../../engine/types';

export const incConfig: ModelConfig = {
  modelId: 'inc',
  tickIntervalMs: 1000,
  initialState: { value: 0 },
  blocks: [
    {
      sourceId: 'inc',
      exportName: 'l1',
      defaultFn: (s) => ({ value: ((s.value as number) ?? 0) + 1 }),
      defaultCode: incCode,
      mapStateIn: (s) => ({ value: s.value }),
      mapStateOut: (out, s) => ({ ...s, value: out.value }),
      tickFrequency: 1,
    },
  ],
  sceneHandler: createIncSceneHandler,
  charts: [
    {
      label: 'Value',
      series: [{ var: 'value', label: 'value', color: '#00ff88' }],
    },
  ],
};
