import { useState, useEffect } from 'react';
import { subscribe, getState } from '../engine/engine';
import type { ModelState } from '../engine/types';
import type { SimContext } from '../useSim';

interface Props {
  ctx: SimContext;
}

function flatten(state: ModelState, prefix = ''): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(state)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number') out.push([path, value]);
    else if (value !== null) out.push(...flatten(value, path));
  }
  return out;
}

export default function SimStatePanel({ ctx }: Props) {
  const { simId } = ctx;
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
