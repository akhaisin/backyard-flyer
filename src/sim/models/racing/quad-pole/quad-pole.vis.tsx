import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { dynamicLabel } from '../../../vis/plugins/dynamicLabel';
import { pole } from '../../../vis/plugins/pole';
import { POLE, POLE_HEIGHT } from './blocks/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadPoleState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; missionType: number };
}
const view = (s: ModelState): QuadPoleState => s as unknown as QuadPoleState;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];
const MISSION_TYPE_LABELS = ['WP', '3DTURN'];

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [-8, 10, 14], lookAt: [4, 2, 0] } }),
  homePad(),
  pole({ position: [POLE.x, POLE.y, POLE.z], height: POLE_HEIGHT }),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos),
  dynamicLabel({
    getText: s => {
      const t = Math.round((view(s).mission.missionType ?? 0));
      return `MODE: ${MISSION_TYPE_LABELS[t] ?? '?'}`;
    },
    position: [POLE.x, POLE_HEIGHT + 1.2, POLE.z],
    color: '#ffaa44',
    fontSize: 32,
  }),
  textLabel({
    text: 'Quad Pole\nAcro-mode coordinated turn\nsweep-left around the pole',
    position: [-10, 0, -10],
    fontSize: 36,
  }),
]);

export default function QuadPoleVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
