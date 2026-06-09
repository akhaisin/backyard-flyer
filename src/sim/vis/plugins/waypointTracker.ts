import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };
type ToggleRef = { enabled: boolean };

export interface VisMission {
  waypointIdx: number;
  target: Vec3;
  phase?: number;
  // When present and non-empty, these points are tracked instead of `target`.
  // Lets a step expose several markers at once (e.g. a cturn's 3 arc waypoints).
  waypoints?: Vec3[];
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
    // Draw a small sequence number (in add order) beside each waypoint ball.
    // Pass a ToggleRef to show/hide the numbers at runtime.
    numbered?: boolean | ToggleRef;
    // Show/hide the waypoint balls (and their numbers). Pass a ToggleRef for a
    // runtime toggle. Default visible.
    visible?: boolean | ToggleRef;
  } = {},
): ScenePlugin {
  const {
    activeColor = 0x00ff88,
    pendingColor = 0xff6622,
    doneColor,
    navigatePhase = 2,
    addWhen,
    numbered = false,
    visible = true,
  } = opts;

  function tracksVisible(): boolean {
    return typeof visible === 'boolean' ? visible : visible.enabled;
  }

  // Labels are built whenever `numbered` is set (true or a ref); a ref additionally
  // toggles their visibility each tick.
  const wantLabels = numbered === true || (typeof numbered === 'object' && numbered !== null);
  function numbersVisible(): boolean {
    return typeof numbered === 'object' && numbered !== null ? numbered.enabled : numbered === true;
  }

  let sceneRef: THREE.Scene | null = null;
  let wpGeo: THREE.SphereGeometry | null = null;
  const seen = new Map<string, { idx: number; mesh: THREE.Mesh; label: THREE.Sprite | null }>();
  let scannedCount = 0;
  let nextLabel = 0;

  function coordKey(t: Vec3): string { return `${t.x},${t.y},${t.z}`; }

  // Small camera-facing number sprite (canvas texture, same pattern as textLabel).
  function makeNumberSprite(text: string): THREE.Sprite {
    const fontSize = 48;
    const pad = 6;
    const font = `bold ${fontSize}px monospace`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + pad * 2;
    const h = fontSize + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      depthTest: false,
      transparent: true,
    }));
    const pixelsPerUnit = 120;
    sprite.scale.set(w / pixelsPerUnit, h / pixelsPerUnit, 1);
    return sprite;
  }

  function tryAdd(state: ModelState): void {
    if (!sceneRef || !wpGeo) return;
    if (addWhen && !addWhen(state)) return;
    const m = getMission(state);
    const idx = Math.round(m.waypointIdx);
    const points = m.waypoints && m.waypoints.length > 0 ? m.waypoints : [m.target];
    for (const t of points) {
      const k = coordKey(t);
      if (seen.has(k)) continue;
      const mesh = new THREE.Mesh(
        wpGeo,
        new THREE.MeshPhongMaterial({ color: pendingColor, emissive: 0x111111 }),
      );
      mesh.position.set(t.x, t.y, t.z);
      sceneRef.add(mesh);

      let label: THREE.Sprite | null = null;
      if (wantLabels) {
        nextLabel += 1;
        label = makeNumberSprite(String(nextLabel));
        label.position.set(t.x + 0.35, t.y + 0.35, t.z);
        label.visible = numbersVisible();
        sceneRef.add(label);
      }

      seen.set(k, { idx, mesh, label });
    }
  }

  return {
    init(scene) {
      sceneRef = scene;
      seen.clear();
      scannedCount = 0;
      nextLabel = 0;
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

      const showTracks  = tracksVisible();
      const showNumbers = showTracks && numbersVisible();
      seen.forEach(({ idx, mesh, label }) => {
        mesh.visible = showTracks;
        const mat = mesh.material as THREE.MeshPhongMaterial;
        if (idx === activeIdx) {
          mat.color.setHex(activeColor);
        } else if (doneColor !== undefined && phaseInt !== undefined) {
          const isDone = phaseInt > navigatePhase || (phaseInt === navigatePhase && idx < activeIdx);
          mat.color.setHex(isDone ? doneColor : pendingColor);
        } else {
          mat.color.setHex(pendingColor);
        }
        if (label) label.visible = showNumbers;
      });
    },
    dispose(scene) {
      seen.forEach(({ mesh, label }) => {
        scene.remove(mesh);
        if (label) {
          scene.remove(label);
          (label.material as THREE.SpriteMaterial).map?.dispose();
          label.material.dispose();
        }
      });
      seen.clear();
      wpGeo?.dispose();
      wpGeo = null;
      sceneRef = null;
    },
  };
}
