import * as THREE from 'three';
import { makeAxes } from '../../sceneUtils';
import type { ScenePlugin } from '../scenePlugin';

interface Opts {
  bg?: number;
  camera?: { pos: [number, number, number]; lookAt: [number, number, number] };
  grid?: { color1?: number; color2?: number };
  ambient?: number;
  directional?: number;
}

export function baseScene(opts: Opts = {}): ScenePlugin {
  const {
    bg = 0x080810,
    camera: cam = { pos: [14, 14, 20], lookAt: [4, 4, 4] },
    grid: g = {},
    ambient = 0.45,
    directional = 0.9,
  } = opts;
  const { color1 = 0x1a1a33, color2 = 0x0d0d1a } = g;

  let ambientLight: THREE.AmbientLight | null = null;
  let dirLight: THREE.DirectionalLight | null = null;
  let grid: THREE.GridHelper | null = null;
  let axisObjects: THREE.Object3D[] = [];

  return {
    init(scene, camera) {
      scene.background = new THREE.Color(bg);

      ambientLight = new THREE.AmbientLight(0xffffff, ambient);
      scene.add(ambientLight);

      dirLight = new THREE.DirectionalLight(0xffffff, directional);
      dirLight.position.set(10, 20, 10);
      scene.add(dirLight);

      grid = new THREE.GridHelper(30, 30, color1, color2);
      scene.add(grid);

      axisObjects = makeAxes(scene);

      camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      camera.lookAt(cam.lookAt[0], cam.lookAt[1], cam.lookAt[2]);
    },
    update() {},
    dispose(scene) {
      [ambientLight, dirLight, grid].forEach(o => { if (o) scene.remove(o); });
      axisObjects.forEach(o => scene.remove(o));
      ambientLight = null;
      dirLight = null;
      grid = null;
      axisObjects = [];
    },
  };
}
