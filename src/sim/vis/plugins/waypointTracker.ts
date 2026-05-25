import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };

export interface VisMission {
  waypointIdx: number;
  target: Vec3;
  phase?: number;
}

export function waypointTracker(
  getMission: (state: ModelState) => VisMission,
  opts: {
    activeColor?: number;
    pendingColor?: number;
    // When set, waypoints with idx < active (or past navigate phase) render as "done"
    doneColor?: number;
    navigatePhase?: number;
    // Only add a waypoint from history/state when this returns true (default: always)
    addWhen?: (state: ModelState) => boolean;
  } = {},
): ScenePlugin {
  const {
    activeColor = 0x00ff88,
    pendingColor = 0xff6622,
    doneColor,
    navigatePhase = 2,
    addWhen,
  } = opts;

  let sceneRef: THREE.Scene | null = null;
  let wpGeo: THREE.SphereGeometry | null = null;
  const seen = new Map<string, { idx: number; mesh: THREE.Mesh }>();
  let scannedCount = 0;

  function coordKey(t: Vec3): string { return `${t.x},${t.y},${t.z}`; }

  function tryAdd(state: ModelState): void {
    if (!sceneRef || !wpGeo) return;
    if (addWhen && !addWhen(state)) return;
    const m = getMission(state);
    const k = coordKey(m.target);
    if (seen.has(k)) return;
    const mesh = new THREE.Mesh(
      wpGeo,
      new THREE.MeshPhongMaterial({ color: pendingColor, emissive: 0x111111 }),
    );
    mesh.position.set(m.target.x, m.target.y, m.target.z);
    sceneRef.add(mesh);
    seen.set(k, { idx: Math.round(m.waypointIdx), mesh });
  }

  return {
    init(scene) {
      sceneRef = scene;
      seen.clear();
      scannedCount = 0;
      wpGeo = new THREE.SphereGeometry(0.3, 10, 10);
    },
    update(state, _tick, history) {
      if (!sceneRef) return;
      for (let i = scannedCount; i < history.length; i++) tryAdd(history[i]);
      scannedCount = history.length;
      // Skip current state on tick 0: initialState target is a config placeholder,
      // not a real mission output. History entries are safe (mission block has run).
      if (history.length > 0) tryAdd(state);

      const { waypointIdx, phase } = getMission(state);
      const activeIdx = Math.round(waypointIdx);
      const phaseInt = phase !== undefined ? Math.round(phase) : undefined;

      seen.forEach(({ idx, mesh }) => {
        const mat = mesh.material as THREE.MeshPhongMaterial;
        if (idx === activeIdx) {
          mat.color.setHex(activeColor);
        } else if (doneColor !== undefined && phaseInt !== undefined) {
          const isDone = phaseInt > navigatePhase || (phaseInt === navigatePhase && idx < activeIdx);
          mat.color.setHex(isDone ? doneColor : pendingColor);
        } else {
          mat.color.setHex(pendingColor);
        }
      });
    },
    dispose(scene) {
      seen.forEach(({ mesh }) => scene.remove(mesh));
      seen.clear();
      wpGeo?.dispose();
      wpGeo = null;
      sceneRef = null;
    },
  };
}
