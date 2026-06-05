// Visualisation plugin for rectangular window gates and the carrot-and-stick
// waypoint. Renders:
//   • A wireframe rectangle for each gate, oriented by its normal vector.
//     Active gate = green, upcoming = orange, done = dark green.
//   • A small yellow sphere for the current carrot position (only during NAVIGATE).
//     Cleared when a window is crossed (windowIdx advances).

import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export type WindowDef = {
  center: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  width: number;
  height: number;
  label?: string;
};

type GateState = {
  windowIdx: number;
  phase: number;
  carrot: { x: number; y: number; z: number };
  pos?: { x: number; y: number; z: number };
};

const NAVIGATE_PHASE = 2;
const COLOR_ACTIVE   = 0x00ff88;
const COLOR_PENDING  = 0xff6622;
const COLOR_DONE     = 0x446644;
const COLOR_CARROT   = 0xffee00;
const COLOR_GUIDE    = 0x66aaff;

const Z_AXIS  = new THREE.Vector3(0, 0, 1);
const WORLD_Y = new THREE.Vector3(0, 1, 0);

export type WindowGateOpts = {
  opacity?: number;   // < 1 renders faintly (transparent material)
  noCarrot?: boolean; // suppress the carrot sphere (for secondary/guide gate calls)
  // Pass `true` for always-on guides, or a ToggleRef from toggleOverlay so a
  // UI switch can enable/disable them at runtime without re-composing the scene.
  drawGuides?: boolean | { enabled: boolean };
};

export function windowGate(
  getState: (state: ModelState) => GateState,
  windows: WindowDef[] | ((staticState: ModelState) => WindowDef[]),
  opts?: WindowGateOpts,
): ScenePlugin {
  let sceneRef: THREE.Scene | null = null;
  const gateMeshes: THREE.LineSegments[] = [];
  const labelSprites: (THREE.Sprite | null)[] = [];
  let carrotMesh: THREE.Mesh | null = null;
  let guideMesh: THREE.LineSegments | null = null;
  let resolvedWindows: WindowDef[] = Array.isArray(windows) ? windows : [];
  // For function-based windows: track the staticState object we last built from.
  // Any change in identity (sim reset, Apply & Start, first run) triggers a rebuild.
  let prevStaticState: ModelState | null = null;

  function buildGate(win: WindowDef, color: number): THREE.LineSegments {
    const geo   = new THREE.EdgesGeometry(new THREE.PlaneGeometry(win.width, win.height));
    const transparent = opts?.opacity !== undefined && opts.opacity < 1;
    const mat   = new THREE.LineBasicMaterial({ color, transparent, opacity: opts?.opacity ?? 1 });
    const lines = new THREE.LineSegments(geo, mat);

    // Rotate the XY-plane rectangle to face the window's normal.
    const normal = new THREE.Vector3(win.normal.x, win.normal.y, win.normal.z).normalize();
    if (Math.abs(normal.dot(Z_AXIS)) < 0.9999) {
      lines.quaternion.setFromUnitVectors(Z_AXIS, normal);
    } else if (normal.z < 0) {
      lines.rotateX(Math.PI);
    }

    lines.position.set(win.center.x, win.center.y, win.center.z);
    return lines;
  }

  // Build a billboard label sprite anchored to the top-right corner of the gate,
  // where "right" is determined by the gate's normal (approach direction).
  // right = worldY × normal — gives the viewer's right when looking along the normal.
  function buildLabel(win: WindowDef): THREE.Sprite | null {
    if (!win.label) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 38px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(win.label, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opts?.opacity ?? 1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 0.4, 1);

    const normal = new THREE.Vector3(win.normal.x, win.normal.y, win.normal.z).normalize();
    const right  = WORLD_Y.clone().cross(normal).normalize();
    // Pull inward by half the sprite extent + a small margin so the label sits
    // fully inside the gate frame. Sprite is 0.8 wide × 0.4 tall.
    const inY = win.height / 2 - 0.25;   // half sprite height (0.2) + 0.05 margin
    const inR = win.width  / 2 - 0.50;   // half sprite width  (0.4) + 0.10 margin
    sprite.position.set(
      win.center.x + inY * WORLD_Y.x + inR * right.x,
      win.center.y + inY * WORLD_Y.y + inR * right.y,
      win.center.z + inY * WORLD_Y.z + inR * right.z,
    );
    return sprite;
  }

  function applyWindows(wins: WindowDef[]) {
    gateMeshes.forEach(lines => {
      sceneRef!.remove(lines);
      lines.geometry.dispose();
      (lines.material as THREE.LineBasicMaterial).dispose();
    });
    gateMeshes.length = 0;
    labelSprites.forEach(sprite => {
      if (!sprite) return;
      sceneRef!.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
    });
    labelSprites.length = 0;
    for (const win of wins) {
      const lines = buildGate(win, COLOR_PENDING);
      sceneRef!.add(lines);
      gateMeshes.push(lines);
      const sprite = buildLabel(win);
      if (sprite) sceneRef!.add(sprite);
      labelSprites.push(sprite);
    }
    resolvedWindows = wins;
  }

  return {
    init(scene) {
      sceneRef = scene;

      if (Array.isArray(windows)) applyWindows(windows);

      // Carrot sphere (small — half the radius of a regular waypoint sphere).
      const geo  = new THREE.SphereGeometry(0.15, 8, 8);
      const mat  = new THREE.MeshPhongMaterial({ color: COLOR_CARROT, emissive: 0x332200 });
      carrotMesh = new THREE.Mesh(geo, mat);
      carrotMesh.visible = false;
      scene.add(carrotMesh);

      // Guide lines: 4 perpendicular lines from quad center to each gate side.
      if (opts?.drawGuides) {
        const guideGeo = new THREE.BufferGeometry();
        // 4 lines × 2 endpoints × 3 coords = 24 floats.
        // 4 guide lines (quad→foot) + 4 extension lines (corner→foot) = 8 × 2 × 3 = 48 floats.
        guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
        // WebGL clamps linewidth to 1, so opacity is the only cross-platform way
        // to make guide lines visually lighter than the solid gate frame lines.
        const guideMat = new THREE.LineBasicMaterial({ color: COLOR_GUIDE, transparent: true, opacity: 0.4 });
        guideMesh = new THREE.LineSegments(guideGeo, guideMat);
        guideMesh.visible = false;
        // Positions are rewritten every tick — frustum culling would use a stale
        // bounding sphere (computed from the initial zeros) once the foot points
        // extend past the gate corners, causing the whole mesh to disappear.
        guideMesh.frustumCulled = false;
        scene.add(guideMesh);
      }
    },

    update(state, _tick, _history, staticState) {
      if (!sceneRef) return;
      if (!Array.isArray(windows) && staticState !== prevStaticState) {
        applyWindows((windows)(staticState));
        prevStaticState = staticState;
      }
      const { windowIdx, phase, carrot, pos } = getState(state);
      const activeIdx   = Math.round(windowIdx);
      const phaseInt    = Math.round(phase);
      const inNavigate  = phaseInt === NAVIGATE_PHASE;
      const pastNavigate = phaseInt > NAVIGATE_PHASE;

      gateMeshes.forEach((lines, idx) => {
        const color =
          idx === activeIdx         ? (inNavigate ? COLOR_ACTIVE : COLOR_PENDING) :
          pastNavigate || idx < activeIdx ? COLOR_DONE :
          COLOR_PENDING;

        (lines.material as THREE.LineBasicMaterial).color.setHex(color);

        const sprite = labelSprites[idx];
        if (sprite) (sprite.material as THREE.SpriteMaterial).color.setHex(color);
      });

      // Carrot: only visible during NAVIGATE; suppressed for secondary gate calls.
      if (carrotMesh && !opts?.noCarrot) {
        carrotMesh.visible = inNavigate;
        if (inNavigate) {
          carrotMesh.position.set(carrot.x, carrot.y, carrot.z);
        }
      }

      // Guide lines: perpendiculars from quad to each side of the active gate.
      // Each line goes from the quad's 3D position to the foot of the perpendicular
      // on the INFINITE line containing that side. When the foot lies within the
      // segment the line lands on the gate frame; when outside it extends past the
      // corner — making misalignment immediately visible.
      if (guideMesh) {
        const dg = opts?.drawGuides;
        const guidesOn = typeof dg === 'object' ? dg.enabled : !!dg;
        if (!pos || !inNavigate || activeIdx >= resolvedWindows.length || !guidesOn) {
          guideMesh.visible = false;
        } else {
          const win = resolvedWindows[activeIdx];
          const normal = new THREE.Vector3(win.normal.x, win.normal.y, win.normal.z).normalize();
          const up     = new THREE.Vector3(0, 1, 0);
          const right  = up.clone().cross(normal).normalize();
          const center = new THREE.Vector3(win.center.x, win.center.y, win.center.z);
          const q      = new THREE.Vector3(pos.x, pos.y, pos.z);

          // Project quad offset onto the gate's local right and up axes.
          const qRel = q.clone().sub(center);
          const qu   = qRel.dot(right);   // signed distance along "right"
          const qv   = qRel.dot(up);      // signed distance along "up"

          const hw = win.width  / 2;
          const hh = win.height / 2;

          // Foot of perpendicular on each side's infinite line (in 3D).
          // top/bottom sides are horizontal (span along right); perp is along up.
          // left/right sides are vertical (span along up);   perp is along right.
          const footTop    = center.clone().addScaledVector(up, +hh).addScaledVector(right, qu);
          const footBottom = center.clone().addScaledVector(up, -hh).addScaledVector(right, qu);
          const footRight  = center.clone().addScaledVector(right, +hw).addScaledVector(up, qv);
          const footLeft   = center.clone().addScaledVector(right, -hw).addScaledVector(up, qv);

          // Clamp qu/qv to the segment bounds to get the nearest gate corner.
          // When the foot is INSIDE the segment: clamped == foot → zero-length extension (invisible).
          // When OUTSIDE: clamped == corner → visible extension from corner to the extended foot.
          const clamped_qu = Math.max(-hw, Math.min(+hw, qu));
          const clamped_qv = Math.max(-hh, Math.min(+hh, qv));

          const extTop    = center.clone().addScaledVector(up, +hh).addScaledVector(right, clamped_qu);
          const extBottom = center.clone().addScaledVector(up, -hh).addScaledVector(right, clamped_qu);
          const extRight  = center.clone().addScaledVector(right, +hw).addScaledVector(up, clamped_qv);
          const extLeft   = center.clone().addScaledVector(right, -hw).addScaledVector(up, clamped_qv);

          const buf = guideMesh.geometry.attributes.position.array as Float32Array;
          let i = 0;
          const seg = (ax: number, ay: number, az: number, b: THREE.Vector3) => {
            buf[i++] = ax; buf[i++] = ay; buf[i++] = az;
            buf[i++] = b.x; buf[i++] = b.y; buf[i++] = b.z;
          };
          const segVV = (a: THREE.Vector3, b: THREE.Vector3) => {
            buf[i++] = a.x; buf[i++] = a.y; buf[i++] = a.z;
            buf[i++] = b.x; buf[i++] = b.y; buf[i++] = b.z;
          };

          // Lines 0–3: quad → foot (guide lines).
          seg(q.x, q.y, q.z, footTop);
          seg(q.x, q.y, q.z, footBottom);
          seg(q.x, q.y, q.z, footRight);
          seg(q.x, q.y, q.z, footLeft);

          // Lines 4–7: corner → foot (extension lines — zero-length when foot is inside segment).
          segVV(extTop,    footTop);
          segVV(extBottom, footBottom);
          segVV(extRight,  footRight);
          segVV(extLeft,   footLeft);
          guideMesh.geometry.attributes.position.needsUpdate = true;
          guideMesh.geometry.computeBoundingSphere();
          guideMesh.visible = true;

          // Tint: green when quad projection is inside the gate aperture, red when outside.
          const inside = Math.abs(qu) <= hw && Math.abs(qv) <= hh;
          (guideMesh.material as THREE.LineBasicMaterial).color.setHex(inside ? 0x44ff88 : 0xff4444);
        }
      }
    },

    dispose(scene) {
      gateMeshes.forEach(lines => {
        scene.remove(lines);
        lines.geometry.dispose();
        (lines.material as THREE.LineBasicMaterial).dispose();
      });
      gateMeshes.length = 0;
      labelSprites.forEach(sprite => {
        if (!sprite) return;
        scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        (sprite.material as THREE.SpriteMaterial).dispose();
      });
      labelSprites.length = 0;
      if (carrotMesh) {
        scene.remove(carrotMesh);
        carrotMesh.geometry.dispose();
        (carrotMesh.material as THREE.MeshPhongMaterial).dispose();
        carrotMesh = null;
      }
      if (guideMesh) {
        scene.remove(guideMesh);
        guideMesh.geometry.dispose();
        (guideMesh.material as THREE.LineBasicMaterial).dispose();
        guideMesh = null;
      }
      prevStaticState = null;
      sceneRef = null;
    },
  };
}
