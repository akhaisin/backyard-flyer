import { initSim } from './engine/engine';
import { modelRegistry } from './registry';
import type { ModelConfig } from './engine/types';

export interface SimContext {
  simId: string;
  config: ModelConfig;
}

export function resolveSimContext(simId: string, modelId?: string): SimContext | null {
  const id = modelId ?? simId;
  const config = modelRegistry[id];
  if (!config) return null;
  initSim(simId, config);
  return { simId, config };
}
