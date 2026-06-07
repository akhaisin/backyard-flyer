// movingTarget — vis plugin for the kinematic c1 chase target.
//
// Renders:
//   • A sphere at the target's current position.
//     Color: moving = orange, arrived (escaped) = dim grey, idle = dark yellow.
//   • Static trajectory lines from pos → dest for each step, read from
//     staticState.K.steps on first update (rebuilt when sim resets).
//   • Optional guide line from the quad to the target (controlled by drawGuide).

import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

type Vec3 = { x: number; y: number; z: number };
type StepInfo = { pos: Vec3; dest: Vec3 };
type ToggleRef = { enabled: boolean };

export function movingTarget(
  getTarget:   (state: ModelState) => { pos: Vec3; phase: number },
  getQuadPos:  (state: ModelState) => Vec3,
  opts: {
    sphereRadius?:  number;
    colorMoving?:   number;
    colorArrived?:  number;
    colorIdle?:     number;
    lineColor?:     number;
    lineOpacity?:   number;
    guideColor?:    number;
    guideOpacity?:  number;
    // Controls the quad-to-target guide line. Pass a ToggleRef from toggleOverlay
    // for runtime control, or a plain boolean for static on/off.
    drawGuide?:     boolean | ToggleRef;
    // When set, the guide line goes quad → getGuideTarget() instead of quad → target.
    // A small indicator dot also appears at that position (same drawGuide toggle).
    // Use this to point the guide at the planner's carrot (e.g. the pre-stage point).
    getGuideTarget?: (state: ModelState) => Vec3;
  } = {},
): ScenePlugin {
  const {
    sphereRadius  = 0.45,
    colorMoving   = 0xff5500,
    colorArrived  = 0x444444,
    colorIdle     = 0x886600,
    lineColor     = 0xff8800,
    lineOpacity   = 0.45,
    guideColor    = 0x44ddff,
    guideOpacity  = 0.65,
    drawGuide     = false,
    getGuideTarget,
  } = opts;

  let sceneRef: THREE.Scene | null = null;
  let sphere: THREE.Mesh | null = null;
  let sphereMat: THREE.MeshPhongMaterial | null = null;
  const trajectoryLines: THREE.Line[] = [];
  let prevStaticState: ModelState | null = null;

  // Guide line (quad → target or guide target) + optional indicator dot
  let guideLine: THREE.Line | null = null;
  let guideGeo: THREE.BufferGeometry | null = null;
  let guideMat: THREE.LineBasicMaterial | null = null;
  let indicatorSphere: THREE.Mesh | null = null;
  let indicatorMat: THREE.MeshPhongMaterial | null = null;

  function guideEnabled(): boolean {
    return typeof drawGuide === 'boolean' ? drawGuide : (drawGuide as ToggleRef).enabled;
  }

  function buildTrajectories(scene: THREE.Scene, staticState: ModelState): void {
    trajectoryLines.forEach(l => { scene.remove(l); l.geometry.dispose(); });
    trajectoryLines.length = 0;

    const steps = ((staticState.K as ModelState | undefined)?.steps ?? []) as Array<{
      pos?: Vec3; dest?: Vec3;
    }>;
    const c1Steps = steps.filter(s => s.dest != null) as StepInfo[];
    const mat = new THREE.LineBasicMaterial({ color: lineColor, opacity: lineOpacity, transparent: true });

    for (const step of c1Steps) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(step.pos.x, step.pos.y, step.pos.z),
        new THREE.Vector3(step.dest.x, step.dest.y, step.dest.z),
      ]);
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      trajectoryLines.push(line);
    }
  }

  return {
    init(scene) {
      sceneRef = scene;
      prevStaticState = null;

      const geo = new THREE.SphereGeometry(sphereRadius, 16, 16);
      sphereMat = new THREE.MeshPhongMaterial({ color: colorMoving, emissive: 0x221100 });
      sphere = new THREE.Mesh(geo, sphereMat);
      scene.add(sphere);

      // Guide line: 2-point buffer, updated every tick.
      guideGeo = new THREE.BufferGeometry();
      guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      guideGeo.setDrawRange(0, 2);
      guideMat = new THREE.LineBasicMaterial({ color: guideColor, opacity: guideOpacity, transparent: true });
      guideLine = new THREE.Line(guideGeo, guideMat);
      scene.add(guideLine);

      // Indicator dot at guide target (only when getGuideTarget is supplied).
      if (getGuideTarget) {
        indicatorMat = new THREE.MeshPhongMaterial({ color: guideColor, emissive: guideColor, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
        indicatorSphere = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), indicatorMat);
        scene.add(indicatorSphere);
      }
    },

    update(state, _tick, _history, staticState) {
      if (!sceneRef || !sphere || !sphereMat) return;

      if (staticState !== prevStaticState) {
        buildTrajectories(sceneRef, staticState);
        prevStaticState = staticState;
      }

      const t = getTarget(state);
      sphere.position.set(t.pos.x, t.pos.y, t.pos.z);

      const phase = Math.round(t.phase);
      sphereMat.color.setHex(
        phase === 1 ? colorMoving :
        phase === 2 ? colorArrived :
        colorIdle,
      );

      // Guide line + indicator dot
      if (guideLine && guideGeo) {
        const on = guideEnabled();
        guideLine.visible = on;
        const guideEnd = getGuideTarget ? getGuideTarget(state) : t.pos;
        if (indicatorSphere) indicatorSphere.visible = on;
        if (on) {
          const qp = getQuadPos(state);
          const buf = guideGeo.attributes.position as THREE.BufferAttribute;
          buf.setXYZ(0, qp.x, qp.y, qp.z);
          buf.setXYZ(1, guideEnd.x, guideEnd.y, guideEnd.z);
          buf.needsUpdate = true;
          if (indicatorSphere) {
            indicatorSphere.position.set(guideEnd.x, guideEnd.y, guideEnd.z);
          }
        }
      }
    },

    dispose(scene) {
      if (sphere)          scene.remove(sphere);
      if (guideLine)       scene.remove(guideLine);
      if (indicatorSphere) scene.remove(indicatorSphere);
      sphere?.geometry.dispose();
      sphereMat?.dispose();
      guideGeo?.dispose();
      guideMat?.dispose();
      indicatorSphere?.geometry.dispose();
      indicatorMat?.dispose();
      trajectoryLines.forEach(l => { scene.remove(l); l.geometry.dispose(); });
      trajectoryLines.length = 0;
      sphere          = null;
      sphereMat       = null;
      guideLine       = null;
      guideGeo        = null;
      guideMat        = null;
      indicatorSphere = null;
      indicatorMat    = null;
      sceneRef        = null;
    },
  };
}
