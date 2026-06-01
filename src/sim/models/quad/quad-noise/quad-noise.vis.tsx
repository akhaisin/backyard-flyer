import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { textLabel } from '../../../vis/plugins/textLabel';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { PHASE_NAVIGATE } from '../../lib/quad/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadNoiseState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number; target: Vec3 };
  wind: { fx: number; fz: number };
  validator: {
    lapsTotal: number;
    completionTick: number;
    completionAccErr: number;
    currentErr: number;
    accErr: number;
    passCount: number;
    passTotal: number;
    pass: number;
  };
}
const view = (s: ModelState): QuadNoiseState => s as unknown as QuadNoiseState;

const num = (staticState: ModelState, key: string): number => {
  const K = staticState.K as ModelState | undefined;
  const v = K?.[key];
  return typeof v === 'number' ? v : 0;
};

function windStrength(s: ModelState): number {
  const w = view(s).wind;
  return Math.sqrt(w.fx * w.fx + w.fz * w.fz);
}

function maxWindForce(staticState: ModelState): number {
  return (num(staticState, 'WIND_MAX_N') * num(staticState, 'WIND_FORCE_MAX_PCT')) / 100;
}

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];
const PASS_GREEN = '#44dd66';

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
    { addWhen: s => Math.round(view(s).mission.phase) === PHASE_NAVIGATE, doneColor: 0x446644 },
  ),
  windSock(s => view(s).wind, { getMaxForceN: maxWindForce }),
  textLabel({
    text: 'Quad Noise\nquad-l4 architecture + disturbances\nwind gusts + sensor noise',
    position: [-10, 0, -10],
    fontSize: 36,
  }),
  infoOverlay({
    corner: 'bottom-left',
    rows: [
      { label: 'Total laps',
        display: (s, _t, K) => `${Math.round(view(s).validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
        valueColor: (s, _t, K) => Math.round(view(s).validator.lapsTotal) >= num(K, 'REQUIRED_LAPS')
          ? PASS_GREEN
          : 'rgba(255, 255, 255, 0.85)' },
      { label: 'Current err',
        display: s => `${view(s).validator.currentErr.toFixed(3)} m`,
        plot: true,
        value: s => view(s).validator.currentErr,
        color: '#ffaa44' },
      { label: 'Acc error',
        display: (s, _t, K) => {
          const v = view(s).validator;
          const accErr = v.completionAccErr >= 0 ? v.completionAccErr : v.accErr;
          return `${accErr.toFixed(0)}/${num(K, 'ACC_ERR_LIMIT')}`;
        },
        valueColor: (s, _t, K) => {
          const v = view(s).validator;
          return v.completionAccErr >= 0 && v.completionAccErr < num(K, 'ACC_ERR_LIMIT')
            ? PASS_GREEN
            : 'rgba(255, 255, 255, 0.85)';
        } },
      { label: 'Duration',
        display: (s, tick, K) => {
          const v = view(s).validator;
          const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
          return `${judgedTick}/${num(K, 'MAX_TICKS')}`;
        },
        valueColor: (s, _t, K) => {
          const v = view(s).validator;
          return v.completionTick >= 0 && v.completionTick <= num(K, 'MAX_TICKS')
            ? PASS_GREEN
            : 'rgba(255, 255, 255, 0.85)';
        } },
      { label: 'Wind',
        display: s => `${windStrength(s).toFixed(2)} N`,
        plot: true,
        value: windStrength,
        color: '#88ccff' },
      { label: 'Pass',
        display: s => {
          const v = view(s).validator;
          const count = `${Math.round(v.passCount)}/${Math.round(v.passTotal)}`;
          return v.pass < 0 ? count : `${count} ${v.pass ? 'PASS' : 'FAIL'}`;
        },
        labelColor: s => {
          const p = view(s).validator.pass;
          return p < 0 ? '#cccc44' : (p ? '#44dd66' : '#ff4444');
        } },
    ],
  }),
]);

export default function QuadNoiseVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
