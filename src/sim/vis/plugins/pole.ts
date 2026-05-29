// Vertical pole (cylinder + spherical cap on top) — marks an obstacle the
// drone flies around. Same shape pattern as homePad.

import * as THREE from 'three';
import type { ScenePlugin } from '../scenePlugin';

export function pole(opts: {
  position?: [number, number, number];
  height?: number;
  radius?: number;
  color?: number;
  capColor?: number;
  capRadius?: number;
} = {}): ScenePlugin {
  const {
    position  = [0, 0, 0],
    height    = 5,
    radius    = 0.08,
    color     = 0xaa8855,
    capColor  = 0xffaa44,
    capRadius = 0.18,
  } = opts;

  let group: THREE.Group | null = null;

  return {
    init(scene) {
      group = new THREE.Group();

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 16),
        new THREE.MeshPhongMaterial({ color }),
      );
      shaft.position.set(0, height / 2, 0);
      group.add(shaft);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(capRadius, 16, 12),
        new THREE.MeshPhongMaterial({ color: capColor, emissive: 0x331100 }),
      );
      cap.position.set(0, height, 0);
      group.add(cap);

      group.position.set(position[0], position[1], position[2]);
      scene.add(group);
    },
    update() {},
    dispose(scene) {
      if (group) scene.remove(group);
      group = null;
    },
  };
}
