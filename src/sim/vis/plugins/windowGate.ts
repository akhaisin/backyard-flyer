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

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function windowGate(
  getState: (state: ModelState) => GateState,
  windows: WindowDef[],
): ScenePlugin {
  let sceneRef: THREE.Scene | null = null;
  const gateMeshes: THREE.LineSegments[] = [];
  let carrotMesh: THREE.Mesh | null = null;

  function buildGate(win: WindowDef, color: number): THREE.LineSegments {
    const geo   = new THREE.EdgesGeometry(new THREE.PlaneGeometry(win.width, win.height));
    const mat   = new THREE.LineBasicMaterial({ color });
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

  return {
    init(scene) {
      sceneRef = scene;

      // Build one gate frame per window.
      for (const win of windows) {
        const lines = buildGate(win, COLOR_PENDING);
        scene.add(lines);
        gateMeshes.push(lines);
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
        const mat = lines.material as THREE.LineBasicMaterial;
        if (idx === activeIdx) {
          mat.color.setHex(inNavigate ? COLOR_ACTIVE : COLOR_PENDING);
        } else if (pastNavigate || idx < activeIdx) {
          mat.color.setHex(COLOR_DONE);
        } else {
          mat.color.setHex(COLOR_PENDING);
        }
      });

      // Carrot: only visible during NAVIGATE, cleared between windows by position update.
      if (carrotMesh) {
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
