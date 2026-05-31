import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { textLabel } from '../../../vis/plugins/textLabel';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { WINDOWS } from './blocks/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadW1aState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number };
  planner_window: { carrot: Vec3 };
  wind: { fx: number; fz: number };
  validator: { lapsTotal: number; lapErr: number; avgErr: number; currentErr: number; misses: number };
}
const view = (s: ModelState): QuadW1aState => s as unknown as QuadW1aState;

function windStrength(s: ModelState): number {
  const w = view(s).wind;
  return Math.sqrt(w.fx * w.fx + w.fz * w.fz);
}

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'MISSED'];

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [14, 14, 20], lookAt: [4, 4, 4] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos),
  windowGate(
    s => ({
      windowIdx: view(s).mission.stepIdx,
      phase:     view(s).mission.phase,
      carrot:    view(s).planner_window.carrot,
    }),
    WINDOWS,
  ),
  windSock(s => view(s).wind, { maxForceN: 1.5 }),
  textLabel({
    text: 'Quad W1a\nWindow gates + carrot-and-stick planner\nstep + status (quad-pole style)',
    position: [-18, 0, 0],
    fontSize: 36,
  }),
  infoOverlay({
    corner: 'bottom-left',
    rows: [
      { label: 'Total laps',  display: s => String(Math.round(view(s).validator.lapsTotal)) },
      { label: 'Misses',      display: s => String(Math.round(view(s).validator.misses)) },
      { label: 'Current err',
        display: s => `${view(s).validator.currentErr.toFixed(3)} m`,
        plot: true,
        value: s => view(s).validator.currentErr,
        color: '#ffaa44' },
      { label: 'Lap error',   display: s => `${view(s).validator.lapErr.toFixed(3)} m` },
      { label: 'Avg error',   display: s => `${view(s).validator.avgErr.toFixed(3)} m` },
      { label: 'Wind',
        display: s => `${windStrength(s).toFixed(2)} N`,
        plot: true,
        value: windStrength,
        color: '#88ccff' },
    ],
  }),
]);

export default function QuadW1aVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
