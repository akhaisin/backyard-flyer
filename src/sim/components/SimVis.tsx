import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect,
  useMemo, useRef, useState,
  type RefObject,
} from 'react';
import {
  subscribe, subscribeRunning, subscribeError,
  startSim, stopSim, resetSim,
  getHistory,
  isRunning, getError, hasPendingChanges,
} from '../engine/engine';
import { resolveSimContext } from '../useSim';
import type { ModelConfig } from '../engine/types';
import './sim.css';

interface SimVisContextValue {
  simId: string;
  config: ModelConfig;
  // Ref so engine-tick subscribers can synchronously skip visual updates
  // entering rewind, without waiting for the next React render.
  rewindTickRef: RefObject<number | null>;
  rewindTick: number | null;
  resetCount: number;
}

const SimVisContext = createContext<SimVisContextValue | null>(null);

export function useSimVis(): SimVisContextValue {
  const ctx = useContext(SimVisContext);
  if (!ctx) throw new Error('useSimVis must be used inside <SimVis>');
  return ctx;
}

interface Props {
  simId?: string;
  modelId?: string;
}

// TODO: refactor outer shell to useResolvedSimContext (src/sim/useResolvedSimContext.ts).
// Difference: SimVis stores { simId, modelId } not SimContext, and defers resolveSimContext
// to render time (so it picks up registry changes without re-running the effect). The hook
// could accept an optional transform, or a second variant useResolvedSimIds could store just
// the ids and leave resolveSimContext to the caller.
type Resolved = { simId: string; modelId?: string };

export default function SimVis({ simId: simIdProp, modelId: modelIdProp }: Props) {
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
  return <SimVisInner simId={resolved.simId} config={ctx.config} />;
}

function SimVisInner({ simId, config }: { simId: string; config: ModelConfig }) {
  const [running, setRunning] = useState(() => isRunning(simId));
  const [error, setError] = useState<Error | null>(() => getError(simId));
  const [historyLen, setHistoryLen] = useState(0);
  const [rewindTick, setRewindTick] = useState<number | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rewindTickRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedHeightRef = useRef<number>(0);
  const runningRef = useRef(running);

  useEffect(() => {
    const unsubState = subscribe(simId, (_state, tick) => setHistoryLen(tick));
    const unsubRunning = subscribeRunning(simId, setRunning);
    const unsubError = subscribeError(simId, setError);
    return () => { unsubState(); unsubRunning(); unsubError(); };
  }, [simId]);

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

  const handleStop = useCallback(() => { stopSim(simId); }, [simId]);

  // Keep ref in sync so the keydown handler never captures a stale `running`.
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      if (runningRef.current) handleStop(); else handleStart();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleStart, handleStop]);

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

  const contextValue = useMemo(
    () => ({ simId, config, rewindTickRef, rewindTick, resetCount }),
    [simId, config, rewindTick, resetCount],
  );

  const VisComponent = config.vis;

  return (
    <SimVisContext.Provider value={contextValue}>
      <div className="sim-vis" ref={containerRef}>
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
          running={running}
          pending={pending}
          isFullscreen={isFullscreen}
          onStart={handleStart}
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

function PlaybackControls({ running, pending, isFullscreen, onStart, onStop, onReset, onFullscreen }: {
  running: boolean;
  pending: boolean;
  isFullscreen: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="sim-vis__controls">
      <div className="sim-vis__controls-left">
        {!running && (
          <button
            className={`sim-vis__btn${pending ? ' sim-vis__btn--pending' : ''}`}
            onClick={onStart}
            title={pending ? 'Apply changes and start (Space)' : 'Start simulation (Space)'}
          >
            {pending ? 'Apply & Start' : 'Start'}
          </button>
        )}
        {running && (
          <button className="sim-vis__btn sim-vis__btn--stop" onClick={onStop} title="Stop simulation (Space)">Stop</button>
        )}
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
