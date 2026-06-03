import { useState, useEffect, useRef } from 'react';
import SimVis from './SimVis';
import { modelRegistry } from '../registry';
import { setCatalogModel } from '../catalogStore';
import './sim.css';

const modelIds = Object.keys(modelRegistry);

// Group by first path segment; models with no '/' are ungrouped (rendered first).
// Deeper paths (a/b/c) are placed in their top-level group (a).
const { ungrouped, groups } = modelIds.reduce<{
  ungrouped: string[];
  groups: Record<string, string[]>;
}>(
  (acc, id) => {
    const sep = id.indexOf('/');
    if (sep === -1) {
      acc.ungrouped.push(id);
    } else {
      const group = id.slice(0, sep);
      (acc.groups[group] ??= []).push(id);
    }
    return acc;
  },
  { ungrouped: [], groups: {} },
);

interface Props {
  height?: string | number;
  defaultModel?: string;
}

export default function SimCatalog({ height, defaultModel }: Props) {
  const [modelId, setModelId] = useState(
    defaultModel && modelIds.includes(defaultModel) ? defaultModel : modelIds[0],
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pageId = containerRef.current?.closest('[data-page-id]')?.getAttribute('data-page-id') ?? '';
    if (pageId) setCatalogModel(pageId, modelId);
  }, [modelId]);

  return (
    <div className="sim-catalog" ref={containerRef}>
      <div className="sim-catalog__header">
        <label className="sim-catalog__label" htmlFor="sim-catalog-select">Model</label>
        <select
          id="sim-catalog-select"
          className="sim-catalog__select"
          value={modelId}
          onChange={e => setModelId(e.target.value)}
        >
          {ungrouped.map(id => <option key={id} value={id}>{id}</option>)}
          {Object.entries(groups).map(([group, ids]) => (
            <optgroup key={group} label={group}>
              {ids.map(id => <option key={id} value={id}>{id.slice(group.length + 1)}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <SimVis simId={modelId} height={height} />
    </div>
  );
}
