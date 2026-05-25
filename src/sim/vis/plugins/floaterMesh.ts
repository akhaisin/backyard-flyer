import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };

export interface VisFloater {
  pos: Vec3;
  vel?: Vec3;
}

export function floaterMesh(
  getVehicle: (state: ModelState) => VisFloater,
  opts: { color?: number; emissive?: number } = {},
): ScenePlugin {
  const { color = 0x44aaff, emissive = 0x001133 } = opts;
  let mesh: THREE.Mesh | null = null;
  let velocityArrow: THREE.ArrowHelper | null = null;

  return {
    init(scene) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 16),
        new THREE.MeshPhongMaterial({ color, emissive }),
      );
      scene.add(mesh);

      velocityArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        0xffdd00,
      );
      scene.add(velocityArrow);
    },
    update(state) {
      if (!mesh || !velocityArrow) return;
      const v = getVehicle(state);

      mesh.position.set(v.pos.x, v.pos.y, v.pos.z);
      velocityArrow.position.set(v.pos.x, v.pos.y, v.pos.z);

      if (v.vel) {
        const speed = Math.sqrt(v.vel.x ** 2 + v.vel.y ** 2 + v.vel.z ** 2);
        if (speed > 0.05) {
          velocityArrow.visible = true;
          velocityArrow.setDirection(new THREE.Vector3(v.vel.x, v.vel.y, v.vel.z).normalize());
          velocityArrow.setLength(Math.min(speed * 0.4, 4), 0.3, 0.15);
        } else {
          velocityArrow.visible = false;
        }
      } else {
        velocityArrow.visible = false;
      }
    },
    dispose(scene) {
      if (mesh) scene.remove(mesh);
      if (velocityArrow) scene.remove(velocityArrow);
      mesh = null;
      velocityArrow = null;
    },
  };
}
