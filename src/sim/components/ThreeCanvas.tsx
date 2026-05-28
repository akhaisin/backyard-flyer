import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { subscribe, getState, getTick, getHistory } from '../engine/engine';
import { useSimVis } from './SimVis';
import type { SceneHandler } from '../engine/types';

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

  // Three.js setup — runs once per (simId, sceneHandler) mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
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
    handler.init(scene, camera);
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
  }, [simId, sceneHandler]);

  // Live engine ticks — skipped while rewinding
  useEffect(() => {
    const unsub = subscribe(simId, (state, tick) => {
      if (rewindTickRef.current === null && sceneRef.current) {
        handlerRef.current?.update(state, tick, getHistory(simId));
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
        handlerRef.current?.update(history[rewindTick], rewindTick, history);
      }
    } else if (prev !== null) {
      const history = getHistory(simId);
      if (history.length > 0) {
        handlerRef.current?.update(history[history.length - 1], history.length, history);
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
    handler.dispose(scene);
    handler.init(scene, camera);
    handler.update(getState(simId), 0, []);
  }, [resetCount, simId]);

  return <div ref={containerRef} className="sim-vis__canvas" />;
}
