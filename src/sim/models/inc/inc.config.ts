import incCode from './blocks/inc.ts?raw';
import { l1 } from './blocks/inc';
import IncVis from './inc.vis';
import type { ModelConfig } from '../../engine/types';

export const incConfig: ModelConfig = {
  modelId: 'inc',
  tickIntervalMs: 1000,
  initialState: { value: 0 },
  blocks: [
    {
      sourceId: 'inc',
      exportName: 'l1',
      defaultFn: (s) => l1(s as Parameters<typeof l1>[0]),
      defaultCode: incCode,
      mapStateIn: (s) => ({ value: s.value }),
      mapStateOut: (out, s) => ({ ...s, value: out.value }),
      tickFrequency: 1,
    },
  ],
  vis: IncVis,
  charts: [
    {
      label: 'Value',
      series: [{ var: 'value', label: 'value', color: '#00ff88' }],
    },
  ],
};
