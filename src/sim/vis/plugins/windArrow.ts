import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export interface VisWind { fx: number; fz: number; }

export function windArrow(
  getWind: (state: ModelState) => VisWind,
  opts: { position?: [number, number, number]; color?: number; lengthPerN?: number } = {},
): ScenePlugin {
  const { position = [0, 13, 0], color = 0x00ffff, lengthPerN = 1.5 } = opts;
  let arrow: THREE.ArrowHelper | null = null;
  let base: THREE.Mesh | null = null;

  return {
    init(scene) {
      const pos = new THREE.Vector3(position[0], position[1], position[2]);

      base = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
      );
      base.position.copy(pos);
      scene.add(base);

      arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), pos, 1, color, 0.6, 0.4);
      scene.add(arrow);
    },
    update(state) {
      if (!arrow) return;
      const w = getWind(state);
      const mag = Math.sqrt(w.fx * w.fx + w.fz * w.fz);
      if (mag > 0.01) {
        arrow.visible = true;
        arrow.setDirection(new THREE.Vector3(w.fx, 0, w.fz).normalize());
        const len = mag * lengthPerN;
        arrow.setLength(len, Math.min(0.6, len * 0.25), Math.min(0.4, len * 0.18));
      } else {
        arrow.visible = false;
      }
    },
    dispose(scene) {
      if (arrow) scene.remove(arrow);
      if (base) scene.remove(base);
      arrow = null;
      base = null;
    },
  };
}
