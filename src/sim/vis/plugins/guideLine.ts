import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };
type ToggleRef = { enabled: boolean };

export function guideLine(
  getFrom: (state: ModelState) => Vec3,
  getTo:   (state: ModelState) => Vec3,
  opts: {
    visible?:   boolean | ToggleRef;
    color?:     number;
    opacity?:   number;
    dotColor?:  number;
    dotRadius?: number;
  } = {},
): ScenePlugin {
  const {
    visible   = true,
    color     = 0x44ddff,
    opacity   = 0.65,
    dotColor,
    dotRadius = 0.25,
  } = opts;

  let line:   THREE.Line | null = null;
  let geo:    THREE.BufferGeometry | null = null;
  let mat:    THREE.LineBasicMaterial | null = null;
  let dot:    THREE.Mesh | null = null;
  let dotMat: THREE.MeshPhongMaterial | null = null;

  function isOn(): boolean {
    return typeof visible === 'boolean' ? visible : (visible as ToggleRef).enabled;
  }

  return {
    init(scene) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setDrawRange(0, 2);
      mat = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
      line = new THREE.Line(geo, mat);
      scene.add(line);

      if (dotColor !== undefined) {
        dotMat = new THREE.MeshPhongMaterial({
          color: dotColor, emissive: dotColor, emissiveIntensity: 0.4,
          transparent: true, opacity: 0.85,
        });
        dot = new THREE.Mesh(new THREE.SphereGeometry(dotRadius, 12, 12), dotMat);
        scene.add(dot);
      }
    },

    update(state) {
      if (!line || !geo) return;
      const on = isOn();
      line.visible = on;
      if (dot) dot.visible = on;
      if (!on) return;

      const from = getFrom(state);
      const to   = getTo(state);
      const buf  = geo.attributes.position as THREE.BufferAttribute;
      buf.setXYZ(0, from.x, from.y, from.z);
      buf.setXYZ(1, to.x,   to.y,   to.z);
      buf.needsUpdate = true;
      if (dot) dot.position.set(to.x, to.y, to.z);
    },

    dispose(scene) {
      if (line) scene.remove(line);
      if (dot)  scene.remove(dot);
      geo?.dispose();
      mat?.dispose();
      dot?.geometry.dispose();
      dotMat?.dispose();
      line = null; geo = null; mat = null; dot = null; dotMat = null;
    },
  };
}
