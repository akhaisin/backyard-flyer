import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { WINDOWS } from './blocks/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadW1aState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; windowIdx: number };
  planner: { carrot: Vec3 };
  wind: { fx: number; fz: number };
}
const view = (s: ModelState): QuadW1aState => s as unknown as QuadW1aState;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'MISSED'];

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [14, 14, 20], lookAt: [4, 4, 4] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }),
  trail(s => view(s).pos),
  windowGate(
    s => ({
      windowIdx: view(s).mission.windowIdx,
      phase:     view(s).mission.phase,
      carrot:    view(s).planner.carrot,
    }),
    WINDOWS,
  ),
  windSock(s => view(s).wind, { maxForceN: 1.5 }),
]);

export default function QuadW1aVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
