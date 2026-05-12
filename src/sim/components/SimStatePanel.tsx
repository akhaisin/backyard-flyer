import { useState, useEffect } from 'react';
import { subscribe, getState } from '../engine/engine';
import type { SimContext } from '../useSim';

interface Props {
  ctx: SimContext;
}

export default function SimStatePanel({ ctx }: Props) {
  const { simId } = ctx;
  const [state, setState] = useState(() => getState(simId));

  useEffect(() => subscribe(simId, s => setState({ ...s })), [simId]);

  return (
    <div className="sim-state">
      {Object.entries(state).map(([key, value]) => (
        <div key={key} className="sim-state__row">
          <span className="sim-state__key">{key}</span>
          <span className="sim-state__value">{value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}
