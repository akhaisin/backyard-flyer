import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { GATES, GUIDE_GATES } from './route';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadLadderState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number };
}
const view = (s: ModelState): QuadLadderState => s as unknown as QuadLadderState;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];

// Route is 8 steps: [WP_entry, CTURN] × 3 levels, with inter-level staging WPs.
// Steps 0–1  → Level 1 (gate index 0: M1 / G1)
// Steps 2–4  → Level 2 (gate index 1: M2 / G2)
// Steps 5–7  → Level 3 (gate index 2: M3 / G3)
const toGateIdx = (stepIdx: number): number => stepIdx < 2 ? 0 : stepIdx < 5 ? 1 : 2;

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [-10, 20, 25], lookAt: [12, 5, 0] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).pos,
    }),
    GATES,
  ),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).pos,
    }),
    GUIDE_GATES,
    { opacity: 0.25, noCarrot: false },
  ),
  textLabel({
    text: 'Quad Ladder\nThree-gate vertical FPV ladder\ncoordinated-turn arcs through each gate pair',
    position: [-15, 0, -15],
    fontSize: 36,
  }),
]);

export default function QuadLadderVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
