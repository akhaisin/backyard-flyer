import { useState, useEffect } from 'react';
import {
  subscribe, subscribeInputs,
  getLiveInputs, getState, getHistory,
  setInput,
} from '../../engine/engine';
import type { ModelState } from '../../engine/types';

export function usePidSimState(simId: string, rewindTick: number | null) {
  const isRewinding = rewindTick !== null;
  const [inputs, setInputsView] = useState<ModelState>(() => getLiveInputs(simId));
  const [stateView, setStateView] = useState<ModelState>(() => getState(simId));

  useEffect(() => {
    if (isRewinding) {
      const snap = getHistory(simId)[rewindTick!];
      if (snap) {
        const snapInputs = snap.inputs;
        setInputsView(typeof snapInputs === 'object' && snapInputs !== null ? snapInputs : {});
        setStateView(snap);
      }
      return;
    }
    setInputsView(structuredClone(getLiveInputs(simId)));
    setStateView(getState(simId));
    const unsubInputs = subscribeInputs(simId, (live) => setInputsView(structuredClone(live)));
    const unsubState = subscribe(simId, (state) => setStateView(state));
    return () => { unsubInputs(); unsubState(); };
  }, [simId, isRewinding, rewindTick]);

  const readBlock = (blockId: string): ModelState => {
    const v = inputs[blockId];
    return typeof v === 'object' && v !== null ? v : {};
  };

  const readNum = (path: string[]): number => {
    let cur: ModelState[string] | undefined = stateView;
    for (const p of path) {
      if (typeof cur !== 'object' || cur === null) return 0;
      cur = (cur as ModelState)[p];
    }
    return typeof cur === 'number' ? cur : 0;
  };

  const handleChange = (blockId: string, field: string, value: number) => {
    if (isRewinding) return;
    setInput(simId, `${blockId}.${field}`, value);
  };

  return { isRewinding, readBlock, readNum, handleChange };
}
