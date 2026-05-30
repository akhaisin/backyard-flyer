import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { PHASE_NAVIGATE } from './blocks/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadL4State {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number; target: Vec3 };
  validator: { lapsTotal: number; lapErr: number; avgErr: number; currentErr: number; pass: number };
}
const view = (s: ModelState): QuadL4State => s as unknown as QuadL4State;

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [14, 14, 20], lookAt: [4, 4, 4] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos),
  waypointTracker(
    s => ({ waypointIdx: view(s).mission.stepIdx, target: view(s).mission.target, phase: view(s).mission.phase }),
    {
      addWhen: s => Math.round(view(s).mission.phase) === PHASE_NAVIGATE,
      doneColor: 0x446644,
    },
  ),
  textLabel({
    text: 'Quad L4\nquad-l3 mission, restructured\nstep + status (quad-pole style)',
    position: [-10, 0, -10],
    fontSize: 36,
  }),
  infoOverlay({
    corner: 'bottom-left',
    rows: [
      { label: 'Total laps',  display: s => String(Math.round(view(s).validator.lapsTotal)) },
      { label: 'Current err',
        display: s => `${view(s).validator.currentErr.toFixed(3)} m`,
        plot: true,
        value: s => view(s).validator.currentErr,
        color: '#ffaa44' },
      { label: 'Lap error',   display: s => `${view(s).validator.lapErr.toFixed(3)} m` },
      { label: 'Avg error',   display: s => `${view(s).validator.avgErr.toFixed(3)} m` },
      { label: 'Pass',
        display: s => view(s).validator.pass ? 'PASS' : 'FAIL',
        labelColor: s => view(s).validator.pass ? '#44dd66' : '#ff4444' },
    ],
  }),
]);

export default function QuadL4Vis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
