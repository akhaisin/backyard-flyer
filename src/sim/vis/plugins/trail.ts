import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };
type ToggleRef = { enabled: boolean };

export function trail(
  getPos: (state: ModelState) => Vec3,
  opts: { color?: number; length?: number; opacity?: number; visible?: boolean | ToggleRef } = {},
): ScenePlugin {
  const { color = 0x4488ff, length: maxLen = 600, opacity = 0.55, visible = true } = opts;
  let geo: THREE.BufferGeometry | null = null;
  let line: THREE.Line | null = null;

  function isVisible(): boolean {
    return typeof visible === 'boolean' ? visible : visible.enabled;
  }

  return {
    init(scene) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxLen * 3), 3));
      geo.setDrawRange(0, 0);
      line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, opacity, transparent: true }));
      scene.add(line);
    },
    update(_state, _tick, history) {
      if (!geo || !line) return;
      line.visible = isVisible();
      if (!line.visible) return;
      const slice = history.slice(-maxLen);
      const buf = geo.attributes.position as THREE.BufferAttribute;
      slice.forEach((h, i) => {
        const p = getPos(h);
        buf.setXYZ(i, p.x, p.y, p.z);
      });
      buf.needsUpdate = true;
      geo.setDrawRange(0, slice.length);
    },
    dispose(scene) {
      if (line) scene.remove(line);
      geo?.dispose();
      geo = null;
      line = null;
    },
  };
}
