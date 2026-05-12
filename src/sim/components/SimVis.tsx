import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  subscribe, subscribeRunning, subscribeError,
  startSim, stopSim, resetSim,
  getState, getHistory, getTick,
  isRunning, getError, hasPendingChanges,
} from '../engine/engine';
import { resolveSimContext } from '../useSim';
import type { ModelConfig, SceneHandler } from '../engine/types';
import './sim.css';

interface Props {
  simId?: string;
  modelId?: string;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const handlerRef = useRef<SceneHandler | null>(null);
  const rafRef = useRef<number>(0);

  const [running, setRunning] = useState(() => isRunning(simId));
  const [error, setError] = useState<Error | null>(() => getError(simId));
  const [historyLen, setHistoryLen] = useState(0);
  const [rewindTick, setRewindTick] = useState<number | null>(null);
  const rewindTickRef = useRef<number | null>(null);

  // Three.js setup — runs once per mount; creates a fresh handler instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const handler = config.sceneHandler();
    handlerRef.current = handler;
    handler.init(scene, camera);

    // Reconstruct visual state from existing history
    handler.update(getState(simId), getTick(simId), getHistory(simId));

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      handler.dispose(scene);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      handlerRef.current = null;
    };
  }, [simId, config]);

  // Subscribe to engine events
  useEffect(() => {
    const unsubState = subscribe(simId, (state, tick) => {
      if (rewindTickRef.current === null && sceneRef.current) {
        handlerRef.current?.update(state, tick, getHistory(simId));
      }
      setHistoryLen(tick);
    });
    const unsubRunning = subscribeRunning(simId, setRunning);
    const unsubError = subscribeError(simId, setError);
    return () => { unsubState(); unsubRunning(); unsubError(); };
  }, [simId]);

  const scrubTo = useCallback((tick: number) => {
    const history = getHistory(simId);
    const clamped = Math.max(0, Math.min(tick, history.length - 1));
    rewindTickRef.current = clamped;
    setRewindTick(clamped);
    if (sceneRef.current && history[clamped]) {
      handlerRef.current?.update(history[clamped], clamped, history);
    }
  }, [simId]);

  const exitRewind = useCallback(() => {
    rewindTickRef.current = null;
    setRewindTick(null);
    const history = getHistory(simId);
    if (sceneRef.current && history.length > 0) {
      handlerRef.current?.update(history[history.length - 1], history.length, history);
    }
  }, [simId]);

  const handleStart = useCallback(() => {
    exitRewind();
    startSim(simId);
  }, [simId, exitRewind]);

  const handleStop = useCallback(() => { stopSim(simId); }, [simId]);

  const handleReset = useCallback(() => {
    exitRewind();
    resetSim(simId);
    setHistoryLen(0);
    if (sceneRef.current && cameraRef.current) {
      const handler = handlerRef.current;
      if (handler) {
        handler.dispose(sceneRef.current);
        handler.init(sceneRef.current, cameraRef.current);
        handler.update(config.initialState, 0, []);
      }
    }
  }, [simId, config, exitRewind]);

  const pending = hasPendingChanges(simId);
  const isRewinding = rewindTick !== null;

  return (
    <div className="sim-vis">
      <div ref={containerRef} className="sim-vis__canvas" />

      {historyLen > 0 && (
        <div className="sim-vis__rewind">
          <span className="sim-vis__rewind-label">
            {isRewinding ? `tick ${rewindTick}` : `live · ${historyLen} ticks`}
          </span>
          <input
            type="range"
            min={0}
            max={historyLen - 1}
            value={isRewinding ? rewindTick : historyLen - 1}
            onChange={e => scrubTo(Number(e.target.value))}
            className="sim-vis__slider"
          />
          {isRewinding && (
            <button className="sim-vis__btn sim-vis__btn--small" onClick={exitRewind}>Live</button>
          )}
        </div>
      )}

      <div className="sim-vis__controls">
        {!running && (
          <button
            className={`sim-vis__btn${pending ? ' sim-vis__btn--pending' : ''}`}
            onClick={handleStart}
          >
            {pending ? 'Apply & Start' : 'Start'}
          </button>
        )}
        {running && (
          <button className="sim-vis__btn sim-vis__btn--stop" onClick={handleStop}>Stop</button>
        )}
        <button className="sim-vis__btn sim-vis__btn--reset" onClick={handleReset}>Reset</button>
      </div>

      {error && (
        <div className="sim-vis__error">
          <strong>Runtime error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}
