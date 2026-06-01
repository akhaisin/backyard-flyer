import { initSim, getConfig } from './engine/engine';
import { modelRegistry } from './registry';
import type { ModelConfig } from './engine/types';

export interface SimContext {
  simId: string;
  config: ModelConfig;
}

export function resolveSimContext(
  simId: string,
  modelId?: string,
  overrides?: Record<string, unknown>,
): SimContext | null {
  const id = modelId ?? simId;
  const entry = modelRegistry[id];
  if (!entry) return null;
  // Factory entries build a fresh config per instance (with any overrides);
  // plain configs are shared singletons. initSim dedupes by simId, so the
  // config is built once per instance — return the engine-stored copy for
  // stable identity across re-renders.
  const config = typeof entry === 'function' ? entry(overrides) : entry;
  initSim(simId, config);
  return { simId, config: getConfig(simId) ?? config };
}
