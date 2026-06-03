import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getBlockCode, stageBlock, revertBlock,
  hasPendingChanges, subscribeStatus, getStatus,
} from '../engine/engine';
import type { SimContext } from '../useSim';
import { useResolvedSimContext } from '../useResolvedSimContext';
import { subscribeSourceSelection, clearSourceSelection } from '../sourceSelectStore';
import OverflowTabs from './OverflowTabs';
import './sim.css';

interface Props {
  ctx?: SimContext;
  simId?: string;
  modelId?: string;
  sourceIds?: string[];
  autoHeight?: boolean;
}

export default function SimSource({ ctx, simId: simIdProp, modelId: modelIdProp, sourceIds, autoHeight }: Props) {
  const { resolved, sentinelRef } = useResolvedSimContext(ctx, simIdProp, modelIdProp);

  if (!resolved) return <div ref={sentinelRef} />;
  return <SimSourceInner ctx={resolved} sourceIds={sourceIds} autoHeight={autoHeight} />;
}

interface InnerProps {
  ctx: SimContext;
  sourceIds?: string[];
  autoHeight?: boolean;
}

interface BlockEditorState {
  code: string;
  error: string | null;
  staged: boolean;
}

function SimSourceInner({ ctx, sourceIds, autoHeight }: InnerProps) {
  const { simId, config } = ctx;
  const visibleBlocks = useMemo(() =>
    sourceIds ? config.blocks.filter(b => sourceIds.includes(b.sourceId)) : config.blocks,
    [config.blocks, sourceIds],
  );

  const [activeSourceId, setActiveSourceId] = useState(visibleBlocks[0]?.sourceId ?? '');
  const [blockStates, setBlockStates] = useState<Record<string, BlockEditorState>>(() => {
    const init: Record<string, BlockEditorState> = {};
    for (const block of visibleBlocks) {
      init[block.sourceId] = {
        code: getBlockCode(simId, block.sourceId),
        error: null,
        staged: false,
      };
    }
    return init;
  });
  const [hasPending, setHasPending] = useState(() => hasPendingChanges(simId));
  const [status, setStatus] = useState(() => getStatus(simId));

  useEffect(() => {
    return subscribeSourceSelection(sel => {
      if (sel?.simId === simId && visibleBlocks.some(b => b.sourceId === sel.sourceId)) {
        setActiveSourceId(sel.sourceId);
        clearSourceSelection();
      }
    });
  }, [simId, visibleBlocks]);

  useEffect(() => {
    return subscribeStatus(simId, (next) => {
      setStatus(next);
      if (next !== 'running') setHasPending(hasPendingChanges(simId));
    });
  }, [simId]);

  const updateCode = useCallback((sourceId: string, code: string) => {
    setBlockStates(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], code, staged: false, error: null },
    }));
  }, []);

  const stage = useCallback((sourceId: string) => {
    const code = blockStates[sourceId]?.code ?? '';
    const result = stageBlock(simId, sourceId, code);
    if (result.ok) {
      setBlockStates(prev => ({
        ...prev,
        [sourceId]: { ...prev[sourceId], staged: true, error: null },
      }));
      setHasPending(true);
    } else {
      setBlockStates(prev => ({
        ...prev,
        [sourceId]: { ...prev[sourceId], error: result.error ?? 'Compilation failed' },
      }));
    }
  }, [simId, blockStates]);

  const revert = useCallback((sourceId: string) => {
    revertBlock(simId, sourceId);
    const defaultCode = getBlockCode(simId, sourceId);
    setBlockStates(prev => ({
      ...prev,
      [sourceId]: { code: defaultCode, error: null, staged: false },
    }));
    setHasPending(hasPendingChanges(simId));
  }, [simId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        stage(activeSourceId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, activeSourceId]);

  const tabs = visibleBlocks.map(b => ({
    id: b.sourceId,
    label: `${b.sourceId}.ts`,
    marked: blockStates[b.sourceId]?.staged ?? false,
  }));

  const activeBlock = blockStates[activeSourceId];

  const running = status === 'running';
  const paused = status === 'paused';

  return (
    <div className={`sim-source${autoHeight ? ' sim-source--auto-height' : ''}`}>
      {visibleBlocks.length > 1 && (
        <OverflowTabs tabs={tabs} activeId={activeSourceId} onSelect={setActiveSourceId} />
      )}

      <div className="sim-source__toolbar">
        <span className="sim-source__label">
          {activeSourceId}.ts
          {activeBlock?.staged && <span className="sim-source__badge">staged</span>}
        </span>
        <div className="sim-source__actions">
          <button className="sim-source__btn sim-source__btn--revert" onClick={() => revert(activeSourceId)}>
            Revert
          </button>
          <button
            className={`sim-source__btn sim-source__btn--stage${activeBlock?.staged ? ' sim-source__btn--done' : ''}`}
            onClick={() => stage(activeSourceId)}
            title="Ctrl+Enter"
          >
            {activeBlock?.staged ? 'Staged ✓' : 'Stage (Ctrl+Enter)'}
          </button>
        </div>
      </div>

      <textarea
        className="sim-source__editor"
        value={activeBlock?.code ?? ''}
        onChange={e => updateCode(activeSourceId, e.target.value)}
        spellCheck={false}
      />

      <div className="sim-source__statusbar">
        {activeBlock?.error && (
          <span className="sim-source__error">{activeBlock.error}</span>
        )}
        {!activeBlock?.error && hasPending && !running && (
          <span className="sim-source__hint">Changes staged — press Start in the Visualization tab to apply</span>
        )}
        {!activeBlock?.error && hasPending && (running || paused) && (
          <span className="sim-source__hint">Stop the simulation to apply staged changes</span>
        )}
      </div>
    </div>
  );
}
