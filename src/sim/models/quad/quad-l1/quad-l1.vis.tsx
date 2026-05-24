import * as THREE from 'three';
import ThreeCanvas from '../../../components/ThreeCanvas';
import { makeAxes } from '../../../sceneUtils';
import type { SceneHandler, ModelState } from '../../../engine/types';

const TRAIL_LENGTH = 600;
const ARM_LEN = 0.65;
const CRUISE_ALT = 5;

const WP_POSITIONS = [
  { x: 8, y: CRUISE_ALT, z: 0 },
  { x: 8, y: CRUISE_ALT, z: 8 },
  { x: 0, y: CRUISE_ALT, z: 8 },
  { x: 0, y: CRUISE_ALT, z: 0 },
];

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

function buildQuadMesh(): { group: THREE.Group; rotors: THREE.Mesh[] } {
  const group = new THREE.Group();
  const rotors: THREE.Mesh[] = [];

  const bodyGeo = new THREE.BoxGeometry(0.35, 0.1, 0.35);
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x223366, emissive: 0x001122 });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  const armMat = new THREE.MeshPhongMaterial({ color: 0x334455 });
  const rotorMat = new THREE.MeshPhongMaterial({ color: 0x2255cc, transparent: true, opacity: 0.75 });
  const rotorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.025, 16);

  const armAngles = [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4];
  for (const angle of armAngles) {
    const armGroup = new THREE.Group();
    armGroup.rotation.y = angle;

    const armGeo = new THREE.BoxGeometry(ARM_LEN, 0.04, 0.055);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.x = ARM_LEN / 2;
    armGroup.add(arm);

    const rotor = new THREE.Mesh(rotorGeo, rotorMat.clone());
    rotor.position.x = ARM_LEN;
    rotor.position.y = 0.05;
    armGroup.add(rotor);
    rotors.push(rotor);

    group.add(armGroup);
  }

  return { group, rotors };
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
  let rotorMeshes: THREE.Mesh[] = [];
  let phaseSprite: THREE.Sprite | null = null;
  let trailLine: THREE.Line | null = null;
  let trailGeo: THREE.BufferGeometry | null = null;
  let wpMeshes: THREE.Mesh[] = [];
  let homePad: THREE.Mesh | null = null;
  let axisObjects: THREE.Object3D[] = [];
  let rotorAngle = 0;

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

      // Waypoint markers
      const wpGeo = new THREE.SphereGeometry(0.3, 10, 10);
      for (const [i, wp] of WP_POSITIONS.entries()) {
        const mat = new THREE.MeshPhongMaterial({ color: 0xff6622, emissive: 0x110800 });
        const mesh = new THREE.Mesh(wpGeo, mat);
        mesh.position.set(wp.x, wp.y, wp.z);
        scene.add(mesh);
        wpMeshes[i] = mesh;
      }

      // Quad
      const built = buildQuadMesh();
      quadGroup = built.group;
      rotorMeshes = built.rotors;
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
      const { pos, attitude, motors, mission: { phase, waypointIdx, armed } } = s;

      // Position
      quadGroup.position.set(pos.x, pos.y, pos.z);

      // Attitude from physics state (roll=x, yaw=y, pitch=z)
      quadGroup.rotation.order = 'YZX';
      quadGroup.rotation.x = attitude.x;  // roll
      quadGroup.rotation.y = attitude.y;  // yaw
      quadGroup.rotation.z = attitude.z;  // pitch

      // Rotor spin — speed proportional to each motor's thrust
      if (armed) {
        const thrusts = [motors.thrust.m0, motors.thrust.m1, motors.thrust.m2, motors.thrust.m3];
        thrusts.forEach((t, i) => {
          const spinRate = 0.03 + t * 0.05;
          rotorAngle += spinRate;
          rotorMeshes[i].rotation.y = rotorAngle * (i % 2 === 0 ? 1 : -1);
          (rotorMeshes[i].material as THREE.MeshPhongMaterial).color.setHex(0x2255cc);
        });
      }

      // Waypoint colors
      const phaseInt = Math.round(phase);
      const wpInt = Math.round(waypointIdx);
      wpMeshes.forEach((m, i) => {
        const mat = m.material as THREE.MeshPhongMaterial;
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
      wpMeshes.forEach(m => scene.remove(m));
      axisObjects.forEach(obj => scene.remove(obj));
      trailGeo?.dispose();
      quadGroup = null;
      trailLine = null;
      trailGeo = null;
      homePad = null;
      wpMeshes = [];
      axisObjects = [];
      rotorMeshes = [];
      phaseSprite = null;
      sceneRef = null;
    },
  };
}

export default function QuadL1Vis() {
  return <ThreeCanvas sceneHandler={createSceneHandler} />;
}
