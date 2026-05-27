import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { GATES, GUIDE_GATES } from './blocks/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadLadderState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number };
  planner: { carrot: Vec3 };
  wind: { fx: number; fz: number };
}
const view = (s: ModelState): QuadLadderState => s as unknown as QuadLadderState;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];

// Steps 0-2 → gate 0, steps 3-5 → gate 1, steps 6-7 → gate 2.
// Pattern: [waypoint, main gate, guide gate] × 2, then [waypoint, main gate].
const toGateIdx = (stepIdx: number) => Math.min(Math.floor(stepIdx / 3), GATES.length - 1);

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [-10, 20, 25], lookAt: [12, 5, 0] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }),
  trail(s => view(s).pos),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).planner.carrot,
    }),
    GATES,
  ),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).planner.carrot,
    }),
    GUIDE_GATES,
    { opacity: 0.25, noCarrot: false },
  ),
  windSock(s => view(s).wind, { maxForceN: 0.50 }),
]);

export default function QuadLadderVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
