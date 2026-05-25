import * as THREE from 'three';
import type { ScenePlugin } from '../scenePlugin';

export function homePad(opts: { position?: [number, number, number]; radius?: number } = {}): ScenePlugin {
  const { position = [0, 0.02, 0], radius = 1.0 } = opts;
  let mesh: THREE.Mesh | null = null;

  return {
    init(scene) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.04, 32),
        new THREE.MeshPhongMaterial({ color: 0x224422, emissive: 0x001100 }),
      );
      mesh.position.set(position[0], position[1], position[2]);
      scene.add(mesh);
    },
    update() {},
    dispose(scene) {
      if (mesh) scene.remove(mesh);
      mesh = null;
    },
  };
}
