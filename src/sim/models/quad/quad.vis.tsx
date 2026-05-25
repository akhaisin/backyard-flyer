import * as THREE from 'three';
import ThreeCanvas from '../../components/ThreeCanvas';
import { makeAxes } from '../../sceneUtils';
import type { SceneHandler, ModelState } from '../../engine/types';

const TRAIL_LENGTH = 600;
const ARM_LEN = 0.65;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadState {
  pos: Vec3;
  attitude: Vec3;  // roll(x), yaw(y), pitch(z) in radians
  motors: { thrust: Motors4 };
  mission: { phase: number; waypointIdx: number; armed: number; target: Vec3 };
}
const view = (s: ModelState): QuadState => s as unknown as QuadState;

const ROTOR_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
// Arc gauge: clockwise from 12 o'clock, length proportional to thrust uniform (0–1).
// r > 1.0 || r < 0.55 discards outside the ring band.
// norm maps angle → [0,1] starting at top going clockwise.
const ROTOR_FRAG = `
  uniform float thrust;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0 || r < 0.55) discard;
    float norm = mod(atan(c.x, c.y), 6.28318530) / 6.28318530;
    bool on = norm < thrust;
    gl_FragColor = vec4(on ? vec3(0.13,0.40,0.95) : vec3(0.04,0.08,0.20), on ? 1.0 : 0.4);
  }
`;

function buildQuadMesh(): { group: THREE.Group; rotorMaterials: THREE.ShaderMaterial[] } {
  const group = new THREE.Group();
  const rotorMaterials: THREE.ShaderMaterial[] = [];

  const bodyGeo = new THREE.BoxGeometry(0.35, 0.1, 0.35);
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x223366, emissive: 0x001122 });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  const armMat = new THREE.MeshPhongMaterial({ color: 0x334455 });
  const rotorGeo = new THREE.PlaneGeometry(0.44, 0.44);

  const armAngles = [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4];
  for (const angle of armAngles) {
    const armGroup = new THREE.Group();
    armGroup.rotation.y = angle;

    const armGeo = new THREE.BoxGeometry(ARM_LEN, 0.04, 0.055);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.x = ARM_LEN / 2;
    armGroup.add(arm);

    const mat = new THREE.ShaderMaterial({
      uniforms: { thrust: { value: 0 } },
      vertexShader: ROTOR_VERT,
      fragmentShader: ROTOR_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const rotorMesh = new THREE.Mesh(rotorGeo, mat);
    rotorMesh.rotation.x = -Math.PI / 2;
    rotorMesh.position.set(ARM_LEN, 0.06, 0);
    armGroup.add(rotorMesh);
    rotorMaterials.push(mat);

    group.add(armGroup);
  }

  return { group, rotorMaterials };
}

function makePhaseLabelSprite(): THREE.Sprite {
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

function updatePhaseLabelSprite(sprite: THREE.Sprite, label: string): void {
  const s = sprite as THREE.Sprite & { _canvas: HTMLCanvasElement };
  const canvas = s._canvas;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffcc44';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  (sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

function createSceneHandler(): SceneHandler {
  let sceneRef: THREE.Scene | null = null;
  let quadGroup: THREE.Group | null = null;
  let rotorMaterials: THREE.ShaderMaterial[] = [];
  let phaseSprite: THREE.Sprite | null = null;
  let trailLine: THREE.Line | null = null;
  let trailGeo: THREE.BufferGeometry | null = null;
  let seenWaypoints: Array<{ key: string; mesh: THREE.Mesh }> = [];
  const wpGeo = new THREE.SphereGeometry(0.3, 10, 10);
  let homePad: THREE.Mesh | null = null;
  let axisObjects: THREE.Object3D[] = [];

  return {
    init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
      sceneRef = scene;
      scene.background = new THREE.Color(0x080810);

      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(10, 20, 10);
      scene.add(dir);

      const grid = new THREE.GridHelper(30, 30, 0x1a1a33, 0x0d0d1a);
      scene.add(grid);
      axisObjects = makeAxes(scene);

      // Home landing pad
      const padGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.04, 32);
      const padMat = new THREE.MeshPhongMaterial({ color: 0x224422, emissive: 0x001100 });
      homePad = new THREE.Mesh(padGeo, padMat);
      homePad.position.set(0, 0.02, 0);
      scene.add(homePad);

      // Quad
      const built = buildQuadMesh();
      quadGroup = built.group;
      rotorMaterials = built.rotorMaterials;
      scene.add(quadGroup);

      // Phase label floating above quad
      phaseSprite = makePhaseLabelSprite();
      quadGroup.add(phaseSprite);

      // Trail
      trailGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(TRAIL_LENGTH * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailGeo.setDrawRange(0, 0);
      const trailMat = new THREE.LineBasicMaterial({ color: 0x4488ff, opacity: 0.55, transparent: true });
      trailLine = new THREE.Line(trailGeo, trailMat);
      scene.add(trailLine);

      camera.position.set(14, 14, 20);
      camera.lookAt(4, 4, 4);
    },

    update(state: ModelState, _tick: number, history: ModelState[]): void {
      if (!quadGroup || !trailGeo || !sceneRef) return;
      const s = view(state);
      const { pos, attitude, motors, mission: { phase, waypointIdx } } = s;

      // Position
      quadGroup.position.set(pos.x, pos.y, pos.z);

      // Attitude from physics state (roll=x, yaw=y, pitch=z)
      quadGroup.rotation.order = 'YZX';
      quadGroup.rotation.x = attitude.x;  // roll
      quadGroup.rotation.y = attitude.y;  // yaw
      quadGroup.rotation.z = attitude.z;  // pitch

      // Rotor gauge — arc length proportional to each motor's thrust
      const thrusts = [motors.thrust.m0, motors.thrust.m1, motors.thrust.m2, motors.thrust.m3];
      thrusts.forEach((t, i) => { rotorMaterials[i].uniforms.thrust.value = t / 10; });

      // Waypoint discovery and coloring
      const phaseInt = Math.round(phase);
      const wpInt = Math.round(waypointIdx);
      if (phaseInt === 2) {
        const t = s.mission.target;
        const key = `${t.x},${t.y},${t.z}`;
        if (!seenWaypoints.some(w => w.key === key)) {
          const mat = new THREE.MeshPhongMaterial({ color: 0xff6622, emissive: 0x110800 });
          const mesh = new THREE.Mesh(wpGeo, mat);
          mesh.position.set(t.x, t.y, t.z);
          sceneRef!.add(mesh);
          seenWaypoints.push({ key, mesh });
        }
      }
      seenWaypoints.forEach(({ mesh }, i) => {
        const mat = mesh.material as THREE.MeshPhongMaterial;
        const isActive = phaseInt === 2 && i === wpInt;
        const isDone = phaseInt > 2 || (phaseInt === 2 && i < wpInt);
        mat.color.setHex(isActive ? 0x00ff88 : isDone ? 0x446644 : 0xff6622);
      });

      // Phase label
      if (phaseSprite) {
        updatePhaseLabelSprite(phaseSprite, PHASE_LABELS[phaseInt] ?? '');
      }

      // Trail
      const trail = history.slice(-TRAIL_LENGTH);
      const positions = trailGeo.attributes.position as THREE.BufferAttribute;
      trail.forEach((h, i) => {
        const hs = view(h);
        positions.setXYZ(i, hs.pos.x, hs.pos.y, hs.pos.z);
      });
      positions.needsUpdate = true;
      trailGeo.setDrawRange(0, trail.length);
    },

    dispose(scene: THREE.Scene): void {
      [quadGroup, trailLine, homePad].forEach(obj => { if (obj) scene.remove(obj); });
      seenWaypoints.forEach(({ mesh }) => scene.remove(mesh));
      axisObjects.forEach(obj => scene.remove(obj));
      trailGeo?.dispose();
      quadGroup = null;
      trailLine = null;
      trailGeo = null;
      homePad = null;
      seenWaypoints = [];
      axisObjects = [];
      rotorMaterials.forEach(m => m.dispose());
      rotorMaterials = [];
      phaseSprite = null;
      sceneRef = null;
    },
  };
}

export default function QuadVis() {
  return <ThreeCanvas sceneHandler={createSceneHandler} />;
}
