import * as THREE from 'three';
import type { SceneHandler, ModelState } from '../../engine/types';
import { makeAxes } from '../../sceneUtils';

const TRAIL_LENGTH = 400;

const wpGeo = new THREE.SphereGeometry(0.25, 8, 8);

// Typed view of the floater state — kept here so the scene handler can read
// nested fields without per-access casts.
type Vec3 = { x: number; y: number; z: number };
interface FloaterState {
  pos: Vec3;
  vel: Vec3;
  mission: { targetIdx: number; target: Vec3 };
}
const view = (s: ModelState): FloaterState => s as unknown as FloaterState;

export function createFloaterSceneHandler(): SceneHandler {
  return (() => {
  let sceneRef: THREE.Scene | null = null;
  let floaterMesh: THREE.Mesh | null = null;
  let velocityArrow: THREE.ArrowHelper | null = null;
  let waypointMeshes: Map<number, THREE.Mesh> = new Map();
  let trailLine: THREE.Line | null = null;
  let trailGeo: THREE.BufferGeometry | null = null;
  let axisObjects: THREE.Object3D[] = [];

  function ensureWaypoint(scene: THREE.Scene, idx: number, x: number, y: number, z: number): void {
    if (waypointMeshes.has(idx)) return;
    const mat = new THREE.MeshPhongMaterial({ color: 0xff6622, emissive: 0x111111 });
    const mesh = new THREE.Mesh(wpGeo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    waypointMeshes.set(idx, mesh);
  }

  return {
    init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
      sceneRef = scene;
      waypointMeshes.clear();
      scene.background = new THREE.Color(0x0a0a14);

      const ambient = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(10, 20, 10);
      scene.add(dir);

      const grid = new THREE.GridHelper(30, 30, 0x222244, 0x111133);
      scene.add(grid);
      axisObjects = makeAxes(scene);

      const geo = new THREE.SphereGeometry(0.4, 16, 16);
      const mat = new THREE.MeshPhongMaterial({ color: 0x44aaff, emissive: 0x001133 });
      floaterMesh = new THREE.Mesh(geo, mat);
      scene.add(floaterMesh);

      velocityArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        0xffdd00,
      );
      scene.add(velocityArrow);

      trailGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(TRAIL_LENGTH * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailGeo.setDrawRange(0, 0);
      const trailMat = new THREE.LineBasicMaterial({ color: 0x4488ff, opacity: 0.6, transparent: true });
      trailLine = new THREE.Line(trailGeo, trailMat);
      scene.add(trailLine);

      camera.position.set(5, 18, 22);
      camera.lookAt(5, 5, 5);
    },

    update(state: ModelState, _tick: number, history: ModelState[]): void {
      if (!floaterMesh || !velocityArrow || !trailGeo || !sceneRef) return;

      const s = view(state);
      const { pos, vel, mission: { targetIdx, target } } = s;

      // Discover waypoints from history and current state
      for (const h of history) {
        const hs = view(h);
        ensureWaypoint(sceneRef, Math.round(hs.mission.targetIdx), hs.mission.target.x, hs.mission.target.y, hs.mission.target.z);
      }
      ensureWaypoint(sceneRef, Math.round(targetIdx), target.x, target.y, target.z);

      // Highlight current target waypoint
      const currentIdx = Math.round(targetIdx);
      waypointMeshes.forEach((m, i) => {
        (m.material as THREE.MeshPhongMaterial).color.setHex(i === currentIdx ? 0x00ff88 : 0xff6622);
      });

      floaterMesh.position.set(pos.x, pos.y, pos.z);

      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      velocityArrow.position.set(pos.x, pos.y, pos.z);
      if (speed > 0.05) {
        velocityArrow.visible = true;
        velocityArrow.setDirection(new THREE.Vector3(vel.x, vel.y, vel.z).normalize());
        velocityArrow.setLength(Math.min(speed * 0.4, 4), 0.3, 0.15);
      } else {
        velocityArrow.visible = false;
      }

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
      [floaterMesh, velocityArrow, trailLine].forEach(obj => { if (obj) scene.remove(obj); });
      waypointMeshes.forEach(m => scene.remove(m));
      waypointMeshes.clear();
      axisObjects.forEach(obj => scene.remove(obj));
      axisObjects = [];
      trailGeo?.dispose();
      floaterMesh = null;
      velocityArrow = null;
      trailLine = null;
      trailGeo = null;
      sceneRef = null;
    },
  };
  })();
}
