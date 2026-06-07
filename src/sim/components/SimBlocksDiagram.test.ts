import { describe, it, expect, vi } from 'vitest';
import { analyzeConnections, connKey } from './SimBlocksDiagram';
import { quadC2aConfig } from '../models/quad/quad-c2a/quad-c2a.config';

vi.mock('../models/quad/quad-c2a/quad-c2a.vis', () => ({ default: () => null }));
vi.mock('@xyflow/react', () => ({ MarkerType: { ArrowClosed: 'arrowclosed' } }));
vi.mock('@dagrejs/dagre', () => ({
  graphlib: {
    Graph: class {
      setDefaultEdgeLabel() {} setGraph() {} setNode() {} setEdge() {}
      node() { return { x: 0, y: 0 }; }
    },
  },
  layout: () => {},
}));

describe('SimBlocksDiagram analyzeConnections', () => {
  it('c2a: detects all declared blocksDiagram edges', () => {
    const config = quadC2aConfig();
    const allConns = analyzeConnections(config);
    const byKey = new Map(allConns.map(c => [connKey(c.from, c.to), c]));
    const missing = (config.blocksDiagram ?? []).filter(
      e => !byKey.has(connKey(e.from, e.to))
    );
    const msg = `missing: ${missing.map(e => `${e.from} → ${e.to}`).join(', ')}`;
    expect(missing, msg).toHaveLength(0);
  });
});
