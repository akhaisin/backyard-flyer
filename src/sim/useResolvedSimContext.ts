import { useState, useLayoutEffect, useRef } from 'react';
import { resolveSimContext } from './useSim';
import type { SimContext } from './useSim';

export function useResolvedSimContext(
  ctx: SimContext | undefined,
  simIdProp: string | undefined,
  modelIdProp: string | undefined,
) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<SimContext | null>(ctx ?? null);

  useLayoutEffect(() => {
    if (ctx) { setResolved(ctx); return; }
    const ancestor   = sentinelRef.current?.closest('[data-sim-id]');
    const domSimId   = ancestor?.getAttribute('data-sim-id')   ?? undefined;
    const domModelId = ancestor?.getAttribute('data-model-id') ?? undefined;
    const sid        = simIdProp ?? domSimId;
    if (sid) {
      const r = resolveSimContext(sid, modelIdProp ?? domModelId);
      if (r) setResolved(r);
    }
  }, [ctx, simIdProp, modelIdProp]);

  return { resolved, sentinelRef };
}
