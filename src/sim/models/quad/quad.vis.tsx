import ThreeCanvas from '../../components/ThreeCanvas';
import { composeScene } from '../../vis/scenePlugin';
import { baseScene } from '../../vis/plugins/baseScene';
import { homePad } from '../../vis/plugins/homePad';
import { trail } from '../../vis/plugins/trail';
import { waypointTracker } from '../../vis/plugins/waypointTracker';
import { quadMesh } from '../../vis/plugins/quadMesh';
import type { ModelState } from '../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadState {
  pos: Vec3;
  attitude: Vec3;  // roll(x), yaw(y), pitch(z) in radians
  motors: { thrust: Motors4 };
  mission: { phase: number; waypointIdx: number; target: Vec3 };
}
const view = (s: ModelState): QuadState => s as unknown as QuadState;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [14, 14, 20], lookAt: [4, 4, 4] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }),
  trail(s => view(s).pos),
  waypointTracker(
    s => ({ waypointIdx: view(s).mission.waypointIdx, target: view(s).mission.target, phase: view(s).mission.phase }),
    { addWhen: s => Math.round(view(s).mission.phase) === 2, doneColor: 0x446644 },
  ),
]);

export default function QuadVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
