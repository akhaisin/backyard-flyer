import { useState, useEffect } from 'react';
import { subscribe, getState, getSimIds, getConfig } from '../engine/engine';
import Accordion from '../../components/Accordion';
import type { ModelState } from '../engine/types';
import type { SimContext } from '../useSim';

interface Props {
  ctx: SimContext;
}

function flatten(state: ModelState, prefix = ''): Array<[string, number]> {
  if (!state) return [];
  const out: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(state)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number') {
      out.push([path, value]);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        const p = `${path}.${i}`;
        if (typeof v === 'number') out.push([p, v]);
        else if (v != null) out.push(...flatten(v, p));
      });
    } else if (value != null) {
      out.push(...flatten(value, path));
    }
  }
  return out;
}

function SimsList({ selectedSimId, onSelect }: {
  selectedSimId: string;
  onSelect: (id: string) => void;
}) {
  const simIds = getSimIds();
  return (
    <div className="sim-list">
      {simIds.map(id => {
        const config = getConfig(id);
        return (
          <button
            key={id}
            className={`sim-list__item${id === selectedSimId ? ' sim-list__item--selected' : ''}`}
            onClick={() => onSelect(id)}
          >
            <span className="sim-list__id">{id}</span>
            {config && config.modelId !== id && (
              <span className="sim-list__model">{config.modelId}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StateRows({ simId }: { simId: string }) {
  const [state, setState] = useState(() => getState(simId));
  useEffect(() => subscribe(simId, s => setState({ ...s })), [simId]);

  return (
    <div className="sim-state">
      {flatten(state).map(([key, value]) => (
        <div key={key} className="sim-state__row">
          <span className="sim-state__key">{key}</span>
          <span className="sim-state__value">{value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

export default function SimStatePanel({ ctx }: Props) {
  const [selectedSimId, setSelectedSimId] = useState(ctx.simId);

  return (
    <Accordion
      storageKey="backyard-flyer.sim-state-panel.accordion"
      sections={[
        {
          key: 'sims',
          title: 'Simulations',
          content: (
            <SimsList
              selectedSimId={selectedSimId}
              onSelect={setSelectedSimId}
            />
          ),
        },
        {
          key: 'state',
          title: 'State',
          defaultExpanded: true,
          content: <StateRows key={selectedSimId} simId={selectedSimId} />,
        },
      ]}
    />
  );
}
