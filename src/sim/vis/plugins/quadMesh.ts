import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

const ARM_LEN = 0.65;

const ROTOR_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
// Two opposite pie halves, each filled clockwise proportional to thrust (0–1).
// Solid border ring at outer edge. Inner radius reduced 30% vs. prior version.
const ROTOR_FRAG = `
  uniform float thrust;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    // Solid outer border
    if (r > 0.88) {
      gl_FragColor = vec4(0.20, 0.60, 1.00, 0.9);
      return;
    }
    if (r < 0.315) discard;
    // Two halves split at E-W axis; angle clockwise from 12 o'clock [0, 1)
    float norm = mod(atan(c.x, c.y), 6.28318530) / 6.28318530;
    float segPos = mod(norm, 0.5) / 0.5;
    float gap = 0.025;
    if (segPos < gap || segPos > 1.0 - gap) discard;
    float fillPos = (segPos - gap) / (1.0 - 2.0 * gap);
    bool lit = fillPos < thrust;
    gl_FragColor = lit
      ? vec4(0.20, 0.60, 1.00, 1.0)
      : vec4(0.04, 0.08, 0.20, 0.5);
  }
`;

function buildMesh(): { group: THREE.Group; rotorMaterials: THREE.ShaderMaterial[] } {
  const group = new THREE.Group();
  const rotorMaterials: THREE.ShaderMaterial[] = [];

  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.1, 0.35),
    new THREE.MeshPhongMaterial({ color: 0x223366, emissive: 0x001122 }),
  ));

  const armMat = new THREE.MeshPhongMaterial({ color: 0x334455 });
  const rotorGeo = new THREE.PlaneGeometry(0.44, 0.44);

  for (const angle of [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4]) {
    const armGroup = new THREE.Group();
    armGroup.rotation.y = angle;

    const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LEN, 0.04, 0.055), armMat);
    arm.position.x = ARM_LEN / 2;
    armGroup.add(arm);

    const mat = new THREE.ShaderMaterial({
      uniforms: { thrust: { value: 0 } },
      vertexShader: ROTOR_VERT,
      fragmentShader: ROTOR_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const rotor = new THREE.Mesh(rotorGeo, mat);
    rotor.rotation.x = -Math.PI / 2;
    rotor.position.set(ARM_LEN, 0.06, 0);
    armGroup.add(rotor);
    rotorMaterials.push(mat);
    group.add(armGroup);
  }

  return { group, rotorMaterials };
}

function makePhaseSprite(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
  );
  sprite.scale.set(4, 1, 1);
  sprite.position.set(0, 1.2, 0);
  (sprite as THREE.Sprite & { _canvas: HTMLCanvasElement })._canvas = canvas;
  return sprite;
}

function updatePhaseSprite(sprite: THREE.Sprite, label: string): void {
  const s = sprite as THREE.Sprite & { _canvas: HTMLCanvasElement };
  const ctx = s._canvas.getContext('2d')!;
  ctx.clearRect(0, 0, s._canvas.width, s._canvas.height);
  ctx.fillStyle = '#ffcc44';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s._canvas.width / 2, s._canvas.height / 2);
  (sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

export interface VisQuad {
  pos: { x: number; y: number; z: number };
  attitude: { x: number; y: number; z: number }; // roll(x), yaw(y), pitch(z)
  motors: { m0: number; m1: number; m2: number; m3: number };
  phase: number;
  phaseLabels: string[];
}

export function quadMesh(getVehicle: (state: ModelState) => VisQuad): ScenePlugin {
  let group: THREE.Group | null = null;
  let rotorMaterials: THREE.ShaderMaterial[] = [];
  let phaseSprite: THREE.Sprite | null = null;

  return {
    init(scene) {
      const built = buildMesh();
      group = built.group;
      rotorMaterials = built.rotorMaterials;
      phaseSprite = makePhaseSprite();
      group.add(phaseSprite);
      scene.add(group);
    },
    update(state) {
      if (!group || !phaseSprite) return;
      const v = getVehicle(state);

      group.position.set(v.pos.x, v.pos.y, v.pos.z);
      group.rotation.order = 'YZX';
      group.rotation.x = v.attitude.x;
      group.rotation.y = v.attitude.y;
      group.rotation.z = v.attitude.z;

      [v.motors.m0, v.motors.m1, v.motors.m2, v.motors.m3].forEach((t, i) => {
        rotorMaterials[i].uniforms.thrust.value = t / 10;
      });

      updatePhaseSprite(phaseSprite, v.phaseLabels[Math.round(v.phase)] ?? '');
    },
    dispose(scene) {
      if (group) scene.remove(group);
      rotorMaterials.forEach(m => m.dispose());
      rotorMaterials = [];
      group = null;
      phaseSprite = null;
    },
  };
}
