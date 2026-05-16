import * as THREE from 'three';
import type { SceneHandler, ModelState } from '../../engine/types';
import { makeAxes } from '../../sceneUtils';

const TRAIL_LENGTH = 400;
const wpGeo = new THREE.SphereGeometry(0.25, 8, 8);

// Typed view of the floater-pid state — single cast at the boundary.
type Vec3 = { x: number; y: number; z: number };
interface Vehicle {
  pos: Vec3;
  vel: Vec3;
  mission: { targetIdx: number; target: Vec3 };
}
interface PidState {
  vehicles: { v1: Vehicle; v2: Vehicle };
}
const view = (s: ModelState): PidState => s as unknown as PidState;

export function createFloaterPidSceneHandler(): SceneHandler {
  return (() => {
    let sceneRef: THREE.Scene | null = null;

    let mesh1: THREE.Mesh | null = null;
    let trail1Geo: THREE.BufferGeometry | null = null;
    let trail1Line: THREE.Line | null = null;

    let mesh2: THREE.Mesh | null = null;
    let trail2Geo: THREE.BufferGeometry | null = null;
    let trail2Line: THREE.Line | null = null;

    const waypointMeshes1: Map<number, THREE.Mesh> = new Map();
    const waypointMeshes2: Map<number, THREE.Mesh> = new Map();
    let axisObjects: THREE.Object3D[] = [];

    function ensureWaypoint(scene: THREE.Scene, map: Map<number, THREE.Mesh>, idx: number, x: number, y: number, z: number, baseColor: number): void {
      if (map.has(idx)) return;
      const mesh = new THREE.Mesh(wpGeo, new THREE.MeshPhongMaterial({ color: baseColor, emissive: 0x111111 }));
      mesh.position.set(x, y, z);
      scene.add(mesh);
      map.set(idx, mesh);
    }

    function makeTrail(scene: THREE.Scene, color: number): { geo: THREE.BufferGeometry; line: THREE.Line } {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, opacity: 0.6, transparent: true }));
      scene.add(line);
      return { geo, line };
    }

    function updateTrail(geo: THREE.BufferGeometry, history: ModelState[], pick: (v: PidState) => Vec3): void {
      const trail = history.slice(-TRAIL_LENGTH);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      trail.forEach((s, i) => {
        const p = pick(view(s));
        pos.setXYZ(i, p.x, p.y, p.z);
      });
      pos.needsUpdate = true;
      geo.setDrawRange(0, trail.length);
    }

    function paintVehicle(
      mesh: THREE.Mesh,
      trailGeo: THREE.BufferGeometry,
      waypointMap: Map<number, THREE.Mesh>,
      baseColor: number,
      activeColor: number,
      pick: (v: PidState) => Vehicle,
      state: ModelState,
      history: ModelState[],
    ): void {
      if (!sceneRef) return;
      const v = pick(view(state));

      // Waypoints: discover only from history (initial-state target is a placeholder)
      for (const h of history) {
        const hv = pick(view(h));
        ensureWaypoint(sceneRef, waypointMap, Math.round(hv.mission.targetIdx), hv.mission.target.x, hv.mission.target.y, hv.mission.target.z, baseColor);
      }
      const activeIdx = Math.round(v.mission.targetIdx);
      waypointMap.forEach((m, i) => {
        (m.material as THREE.MeshPhongMaterial).color.setHex(i === activeIdx ? activeColor : baseColor);
      });

      mesh.position.set(v.pos.x, v.pos.y, v.pos.z);
      updateTrail(trailGeo, history, vs => pick(vs).pos);
    }

    return {
      init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
        sceneRef = scene;
        waypointMeshes1.clear();
        waypointMeshes2.clear();
        scene.background = new THREE.Color(0x0a0a14);

        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
        scene.add(dir);
        scene.add(new THREE.GridHelper(30, 30, 0x222244, 0x111133));
        axisObjects = makeAxes(scene);

        // Vehicle 1 (left, P) — blue
        mesh1 = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 16, 16),
          new THREE.MeshPhongMaterial({ color: 0x4488ff, emissive: 0x001133 }),
        );
        scene.add(mesh1);
        const t1 = makeTrail(scene, 0x4488ff);
        trail1Geo = t1.geo; trail1Line = t1.line;

        // Vehicle 2 (right, PID) — orange
        mesh2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 16, 16),
          new THREE.MeshPhongMaterial({ color: 0xff8800, emissive: 0x1a0500 }),
        );
        scene.add(mesh2);
        const t2 = makeTrail(scene, 0xff8800);
        trail2Geo = t2.geo; trail2Line = t2.line;

        camera.position.set(0, 18, 30);
        camera.lookAt(0, 5, 5);
      },

      update(state: ModelState, _tick: number, history: ModelState[]): void {
        if (!mesh1 || !mesh2 || !trail1Geo || !trail2Geo) return;
        paintVehicle(mesh1, trail1Geo, waypointMeshes1, 0x4488ff, 0x00ff88,
          v => v.vehicles.v1, state, history);
        paintVehicle(mesh2, trail2Geo, waypointMeshes2, 0xff8800, 0x00ff88,
          v => v.vehicles.v2, state, history);
      },

      dispose(scene: THREE.Scene): void {
        [mesh1, trail1Line, mesh2, trail2Line].forEach(obj => { if (obj) scene.remove(obj); });
        waypointMeshes1.forEach(m => scene.remove(m));
        waypointMeshes1.clear();
        waypointMeshes2.forEach(m => scene.remove(m));
        waypointMeshes2.clear();
        axisObjects.forEach(obj => scene.remove(obj));
        axisObjects = [];
        trail1Geo?.dispose(); trail2Geo?.dispose();
        mesh1 = null; trail1Line = null; trail1Geo = null;
        mesh2 = null; trail2Line = null; trail2Geo = null;
        sceneRef = null;
      },
    };
  })();
}
