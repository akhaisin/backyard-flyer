import * as THREE from 'three';
import type { SceneHandler, ModelState } from '../../engine/types';
import { makeAxes } from '../../sceneUtils';

const TRAIL_LENGTH = 400;
const wpGeo = new THREE.SphereGeometry(0.25, 8, 8);


export function createFloaterPidSceneHandler(): SceneHandler {
  return (() => {
    let sceneRef: THREE.Scene | null = null;

    let mesh1: THREE.Mesh | null = null;
    let trail1Geo: THREE.BufferGeometry | null = null;
    let trail1Line: THREE.Line | null = null;

    let mesh2: THREE.Mesh | null = null;
    let trail2Geo: THREE.BufferGeometry | null = null;
    let trail2Line: THREE.Line | null = null;

    let waypointMeshes1: Map<number, THREE.Mesh> = new Map();
    let waypointMeshes2: Map<number, THREE.Mesh> = new Map();
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

    function updateTrail(geo: THREE.BufferGeometry, history: ModelState[], xk: string, yk: string, zk: string): void {
      const trail = history.slice(-TRAIL_LENGTH);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      trail.forEach((s, i) => pos.setXYZ(i, s[xk], s[yk], s[zk]));
      pos.needsUpdate = true;
      geo.setDrawRange(0, trail.length);
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

        // Floater 1 — blue (P-only)
        mesh1 = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 16, 16),
          new THREE.MeshPhongMaterial({ color: 0x4488ff, emissive: 0x001133 }),
        );
        scene.add(mesh1);
        const t1 = makeTrail(scene, 0x4488ff);
        trail1Geo = t1.geo; trail1Line = t1.line;

        // Floater 2 — orange (PID)
        mesh2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 16, 16),
          new THREE.MeshPhongMaterial({ color: 0xff8800, emissive: 0x1a0500 }),
        );
        scene.add(mesh2);
        const t2 = makeTrail(scene, 0xff8800);
        trail2Geo = t2.geo; trail2Line = t2.line;

        camera.position.set(25, 25, 25);
        camera.lookAt(0, 0, 0);
      },

      update(state: ModelState, _tick: number, history: ModelState[]): void {
        if (!mesh1 || !mesh2 || !trail1Geo || !trail2Geo || !sceneRef) return;

        // Discover waypoints for each floater from history
        for (const s of history) {
          ensureWaypoint(sceneRef, waypointMeshes1, Math.round(s.targetIdx1), s.targetX1, s.targetY1, s.targetZ1, 0x4488ff);
          ensureWaypoint(sceneRef, waypointMeshes2, Math.round(s.targetIdx2), s.targetX2, s.targetY2, s.targetZ2, 0xff8800);
        }
        ensureWaypoint(sceneRef, waypointMeshes1, Math.round(state.targetIdx1), state.targetX1, state.targetY1, state.targetZ1, 0x4488ff);
        ensureWaypoint(sceneRef, waypointMeshes2, Math.round(state.targetIdx2), state.targetX2, state.targetY2, state.targetZ2, 0xff8800);

        // Highlight each floater's active waypoint
        const activeIdx1 = Math.round(state.targetIdx1);
        const activeIdx2 = Math.round(state.targetIdx2);
        waypointMeshes1.forEach((m, i) => {
          (m.material as THREE.MeshPhongMaterial).color.setHex(i === activeIdx1 ? 0x00ff88 : 0x4488ff);
        });
        waypointMeshes2.forEach((m, i) => {
          (m.material as THREE.MeshPhongMaterial).color.setHex(i === activeIdx2 ? 0x00ff88 : 0xff8800);
        });

        mesh1.position.set(state.x1, state.y1, state.z1);
        mesh2.position.set(state.x2, state.y2, state.z2);

        updateTrail(trail1Geo, history, 'x1', 'y1', 'z1');
        updateTrail(trail2Geo, history, 'x2', 'y2', 'z2');
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
