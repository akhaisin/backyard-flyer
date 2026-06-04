import {
  useCallback, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
} from 'react';
import {
  subscribe, subscribeStatus, subscribeError,
  startSim, pauseSim, stopSim, resetSim,
  getHistory,
  getStatus, getError, hasPendingChanges,
} from '../engine/engine';
import { resolveSimContext } from '../useSim';
import type { ModelConfig } from '../engine/types';
import { SimVisContext } from './SimVisContext';
import './sim.css';

export { useSimVis } from './SimVisContext';

interface Props {
  simId?: string;
  modelId?: string;
  height?: string | number;
}

// TODO: refactor outer shell to useResolvedSimContext (src/sim/useResolvedSimContext.ts).
// Difference: SimVis stores { simId, modelId } not SimContext, and defers resolveSimContext
// to render time (so it picks up registry changes without re-running the effect). The hook
// could accept an optional transform, or a second variant useResolvedSimIds could store just
// the ids and leave resolveSimContext to the caller.
type Resolved = { simId: string; modelId?: string };

export default function SimVisComponent({ simId: simIdProp, modelId: modelIdProp, height }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<Resolved | null>(
    simIdProp ? { simId: simIdProp, modelId: modelIdProp } : null,
  );

  useLayoutEffect(() => {
    const ancestor = sentinelRef.current?.closest('[data-sim-id]');
    const domSimId = ancestor?.getAttribute('data-sim-id') ?? undefined;
    const domModelId = ancestor?.getAttribute('data-model-id') ?? undefined;
    const effectiveSimId = simIdProp ?? domSimId;
    if (effectiveSimId) {
      setResolved({ simId: effectiveSimId, modelId: modelIdProp ?? domModelId });
    }
  }, [simIdProp, modelIdProp]);

  if (!resolved) return <div ref={sentinelRef} />;

  const ctx = resolveSimContext(resolved.simId, resolved.modelId);
  if (!ctx) return <div className="panel-placeholder">No simulation for this page.</div>;
  return <SimVisInner simId={resolved.simId} config={ctx.config} height={height} />;
}

function SimVisInner({ simId, config, height }: { simId: string; config: ModelConfig; height?: string | number }) {
  const [status, setStatus] = useState(() => getStatus(simId));
  const [error, setError] = useState<Error | null>(() => getError(simId));
  const [historyLen, setHistoryLen] = useState(0);
  const [rewindTick, setRewindTick] = useState<number | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rewindTickRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedHeightRef = useRef<number>(0);
  const statusRef = useRef(status);

  useEffect(() => {
    const unsubState = subscribe(simId, (_state, tick) => setHistoryLen(tick));
    const unsubStatus = subscribeStatus(simId, setStatus);
    const unsubError = subscribeError(simId, setError);
    return () => { unsubState(); unsubStatus(); unsubError(); };
  }, [simId]);

  // Request keyboard focus for this frame on mount so Space works immediately
  // when the app is embedded in an iframe without needing a prior click.
  // Guard: only call when this instance is visible — article islands in #page-store
  // (display:none) mount permanently and must not steal focus or fire Space.
  useEffect(() => {
    if (containerRef.current?.offsetParent !== null) window.focus();
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const isNowFullscreen = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen && containerRef.current && savedHeightRef.current > 0) {
        // Pin the saved height so the flex layout can constrain .sim-vis__canvas,
        // which triggers the ResizeObserver in ThreeCanvas to correct the canvas size.
        const el = containerRef.current;
        el.style.height = `${savedHeightRef.current}px`;
        requestAnimationFrame(() => { requestAnimationFrame(() => { el.style.height = ''; }); });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const scrubTo = useCallback((tick: number) => {
    const history = getHistory(simId);
    const clamped = Math.max(0, Math.min(tick, history.length - 1));
    rewindTickRef.current = clamped;
    setRewindTick(clamped);
  }, [simId]);

  const exitRewind = useCallback(() => {
    rewindTickRef.current = null;
    setRewindTick(null);
  }, []);

  const handleStart = useCallback(() => {
    exitRewind();
    startSim(simId);
  }, [simId, exitRewind]);

  const handlePause = useCallback(() => { pauseSim(simId); }, [simId]);
  const handleStop = useCallback(() => { stopSim(simId); }, [simId]);

  // Keep ref in sync so the keydown handler never captures a stale status.
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Skip hidden instances (articles sitting in #page-store with display:none).
      // offsetParent is null for elements whose ancestor has display:none.
      if (!containerRef.current?.offsetParent) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      if (statusRef.current === 'running') handlePause(); else handleStart();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleStart, handlePause]);

  const handleReset = useCallback(() => {
    exitRewind();
    resetSim(simId);
    setHistoryLen(0);
    setResetCount(c => c + 1);
  }, [simId, exitRewind]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      savedHeightRef.current = containerRef.current?.offsetHeight ?? 0;
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const pending = hasPendingChanges(simId);
  const isRewinding = rewindTick !== null;
  const running = status === 'running';
  const paused = status === 'paused';

  const contextValue = useMemo(
    () => ({ simId, config, rewindTickRef, rewindTick, resetCount }),
    [simId, config, rewindTick, resetCount],
  );

  const VisComponent = config.vis;

  return (
    <SimVisContext.Provider value={contextValue}>
      <div className="sim-vis" ref={containerRef} style={height !== undefined ? { height } : undefined}>
        <VisComponent />

        {historyLen > 0 && (
          <RewindControl
            historyLen={historyLen}
            rewindTick={rewindTick}
            isRewinding={isRewinding}
            onScrub={scrubTo}
            onExit={exitRewind}
          />
        )}

        <PlaybackControls
          status={status}
          pending={pending}
          isFullscreen={isFullscreen}
          onStart={handleStart}
          onPause={handlePause}
          onStop={handleStop}
          onReset={handleReset}
          onFullscreen={handleFullscreen}
        />

        {error && <SimErrorBar error={error} />}
      </div>
    </SimVisContext.Provider>
  );
}

function RewindControl({ historyLen, rewindTick, isRewinding, onScrub, onExit }: {
  historyLen: number;
  rewindTick: number | null;
  isRewinding: boolean;
  onScrub: (tick: number) => void;
  onExit: () => void;
}) {
  return (
    <div className="sim-vis__rewind">
      <span className="sim-vis__rewind-label">
        {isRewinding ? `tick ${rewindTick}` : `live · ${historyLen} ticks`}
      </span>
      <input
        type="range"
        min={0}
        max={historyLen - 1}
        value={isRewinding ? rewindTick! : historyLen - 1}
        onChange={e => onScrub(Number(e.target.value))}
        className="sim-vis__slider"
      />
      {isRewinding && (
        <button className="sim-vis__btn sim-vis__btn--small" onClick={onExit}>Live</button>
      )}
    </div>
  );
}

function PlaybackControls({ status, pending, isFullscreen, onStart, onPause, onStop, onReset, onFullscreen }: {
  status: 'stopped' | 'running' | 'paused';
  pending: boolean;
  isFullscreen: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onFullscreen: () => void;
}) {
  const running = status === 'running';
  const paused = status === 'paused';

  return (
    <div className="sim-vis__controls">
      <div className="sim-vis__controls-left">
        <button
          className={`sim-vis__btn${pending && !paused && !running ? ' sim-vis__btn--pending' : ''}`}
          onClick={running ? onPause : onStart}
          title={running ? 'Pause simulation (Space)' : pending ? 'Apply changes and start (Space)' : 'Start simulation (Space)'}
        >
          {running ? 'Pause' : pending && !paused ? 'Apply & Start' : 'Start'}
        </button>
        <button
          className="sim-vis__btn sim-vis__btn--stop"
          onClick={onStop}
          title={paused ? 'Stop simulation' : 'Pause the simulation before stopping'}
          disabled={!paused}
        >
          Stop
        </button>
        <button className="sim-vis__btn sim-vis__btn--reset" onClick={onReset}>Reset</button>
      </div>
      <button
        className="sim-vis__btn sim-vis__btn--icon"
        onClick={onFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? '⮌' : '⛶'}
      </button>
    </div>
  );
}

function SimErrorBar({ error }: { error: Error }) {
  return (
    <div className="sim-vis__error">
      <strong>Runtime error:</strong> {error.message}
    </div>
  );
}
