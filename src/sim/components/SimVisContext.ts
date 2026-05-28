import { createContext, useContext, type RefObject } from 'react';
import type { ModelConfig } from '../engine/types';

export interface SimVisContextValue {
  simId: string;
  config: ModelConfig;
  rewindTickRef: RefObject<number | null>;
  rewindTick: number | null;
  resetCount: number;
}

export const SimVisContext = createContext<SimVisContextValue | null>(null);

export function useSimVis(): SimVisContextValue {
  const ctx = useContext(SimVisContext);
  if (!ctx) throw new Error('useSimVis must be used inside <SimVis>');
  return ctx;
}
