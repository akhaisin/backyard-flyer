import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { subscribe, getState, getTick, getHistory, getStatic } from '../engine/engine';
import { useSimVis } from './SimVisContext';
import type { SceneHandler } from '../engine/types';

let activeWebGLContexts = 0;

interface Props {
  sceneHandler: () => SceneHandler;
}

export default function ThreeCanvas({ sceneHandler }: Props) {
  const { simId, rewindTickRef, rewindTick, resetCount } = useSimVis();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const handlerRef = useRef<SceneHandler | null>(null);
  const rafRef = useRef<number>(0);
  const prevRewindRef = useRef<number | null>(null);

  // Three.js setup — deferred until canvas is first visible (non-zero size).
  // All pages mount at app load into the hidden #page-store; creating a WebGLRenderer
  // there would exhaust the browser's context limit (~8-16) before the user sees anything.
  // ResizeObserver fires with real dimensions once PageShell moves this page into view.
  // The RAF loop is never paused for tab switches — only cleaned up on unmount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let unmounted = false;

    function initRenderer(width: number, height: number) {
      if (!el || rendererRef.current || unmounted) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      activeWebGLContexts++;
      console.log(`[ThreeCanvas] context created — active: ${activeWebGLContexts}`, simId);
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.domElement.tabIndex = -1;
      renderer.domElement.style.outline = 'none';
      el.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
      controlsRef.current = controls;

      const handler = sceneHandler();
      handlerRef.current = handler;
      handler.init(scene, camera, el);
      handler.update(getState(simId), getTick(simId), getHistory(simId), getStatic(simId));

      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      if (!rendererRef.current) {
        initRenderer(width, height);
      } else {
        rendererRef.current.setSize(width, height);
        cameraRef.current!.aspect = width / height;
        cameraRef.current!.updateProjectionMatrix();
      }
    });
    ro.observe(el);

    // Initialize immediately if already visible (e.g. direct deep-link to Vis tab)
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      initRenderer(el.clientWidth, el.clientHeight);
    }

    return () => {
      unmounted = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (scene && renderer) {
        handlerRef.current?.dispose(scene);
        controlsRef.current?.dispose();
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        activeWebGLContexts--;
        console.log(`[ThreeCanvas] context disposed — active: ${activeWebGLContexts}`, simId);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      handlerRef.current = null;
    };
  }, [simId, sceneHandler]);

  // Live engine ticks — skipped while rewinding
  useEffect(() => {
    const unsub = subscribe(simId, (state, tick) => {
      if (rewindTickRef.current === null && sceneRef.current) {
        handlerRef.current?.update(state, tick, getHistory(simId), getStatic(simId));
      }
    });
    return unsub;
  }, [simId, rewindTickRef]);

  // Rewind scrub / exit
  useEffect(() => {
    if (!sceneRef.current) return;
    const prev = prevRewindRef.current;
    prevRewindRef.current = rewindTick;

    if (rewindTick !== null) {
      const history = getHistory(simId);
      if (history[rewindTick]) {
        handlerRef.current?.update(history[rewindTick], rewindTick, history, getStatic(simId));
      }
    } else if (prev !== null) {
      const history = getHistory(simId);
      if (history.length > 0) {
        handlerRef.current?.update(history[history.length - 1], history.length, history, getStatic(simId));
      }
    }
  }, [rewindTick, simId]);

  // Reset — dispose & re-init handler so trail-like state clears
  useEffect(() => {
    if (resetCount === 0) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const handler = handlerRef.current;
    if (!scene || !camera || !handler) return;
    const el = containerRef.current;
    if (!el) return;
    handler.dispose(scene);
    handler.init(scene, camera, el);
    handler.update(getState(simId), 0, [], getStatic(simId));
  }, [resetCount, simId]);

  return <div ref={containerRef} className="sim-vis__canvas" />;
}
