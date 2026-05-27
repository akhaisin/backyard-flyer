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
};

const NAVIGATE_PHASE = 2;
const COLOR_ACTIVE   = 0x00ff88;
const COLOR_PENDING  = 0xff6622;
const COLOR_DONE     = 0x446644;
const COLOR_CARROT   = 0xffee00;

const Z_AXIS  = new THREE.Vector3(0, 0, 1);
const WORLD_Y = new THREE.Vector3(0, 1, 0);

export type WindowGateOpts = {
  opacity?: number;   // < 1 renders faintly (transparent material)
  noCarrot?: boolean; // suppress the carrot sphere (for secondary/guide gate calls)
};

export function windowGate(
  getState: (state: ModelState) => GateState,
  windows: WindowDef[],
  opts?: WindowGateOpts,
): ScenePlugin {
  let sceneRef: THREE.Scene | null = null;
  const gateMeshes: THREE.LineSegments[] = [];
  const labelSprites: (THREE.Sprite | null)[] = [];
  let carrotMesh: THREE.Mesh | null = null;

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

  return {
    init(scene) {
      sceneRef = scene;

      // Build one gate frame + optional label per window.
      for (const win of windows) {
        const lines = buildGate(win, COLOR_PENDING);
        scene.add(lines);
        gateMeshes.push(lines);

        const sprite = buildLabel(win);
        if (sprite) scene.add(sprite);
        labelSprites.push(sprite);
      }

      // Carrot sphere (small — half the radius of a regular waypoint sphere).
      const geo  = new THREE.SphereGeometry(0.15, 8, 8);
      const mat  = new THREE.MeshPhongMaterial({ color: COLOR_CARROT, emissive: 0x332200 });
      carrotMesh = new THREE.Mesh(geo, mat);
      carrotMesh.visible = false;
      scene.add(carrotMesh);
    },

    update(state) {
      if (!sceneRef) return;
      const { windowIdx, phase, carrot } = getState(state);
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
      sceneRef = null;
    },
  };
}
