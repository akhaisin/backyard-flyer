import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import type { WindowDef } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { textLabel } from '../../../vis/plugins/textLabel';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { W1B_ROUTE } from './route';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadW1bState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number };
  planner_w1b: { carrot: Vec3; preGateDone: number };
  wind: { fx: number; fz: number };
  validator: {
    lapsTotal: number;
    restarts: number;
    completionTick: number;
    completionAccErr: number;
    currentErr: number;
    accErr: number;
    passCount: number;
    passTotal: number;
    pass: number;
  };
}
const view = (s: ModelState): QuadW1bState => s as unknown as QuadW1bState;

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

// Gate frames from the route: pos → center, label W1..Wn.
const WINDOWS: WindowDef[] = W1B_ROUTE.map((s, i) => ({
  center: s.pos,
  normal: s.normal ?? { x: 1, y: 0, z: 0 },
  width:  s.width  ?? 5,
  height: s.height ?? 5,
  label:  `W${i + 1}`,
}));

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const PASS_GREEN = '#44dd66';
const FAIL_RED = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

const sceneHandler = composeScene(() => [
  baseScene({ bg: 0x080810, camera: { pos: [14, 14, 20], lookAt: [0, 4, 0] } }),
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
      carrot:    view(s).planner_w1b.carrot,
    }),
    WINDOWS,
  ),
  windSock(s => view(s).wind, { getMaxForceN: maxWindForce }),
  textLabel({
    text: 'Quad W1b\nWindow gates + pre-stage approach\nshared lib + planner_w1b / navigator_w1',
    position: [-18, 0, 0],
    fontSize: 36,
  }),
  infoOverlay({
    corner: 'bottom-left',
    rows: [
      { label: 'Total laps',
        display: (s, _t, K) => `${Math.round(view(s).validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
        valueColor: (s, tick, K) => {
          const v = view(s).validator;
          const passed = Math.round(v.lapsTotal) >= num(K, 'REQUIRED_LAPS');
          const timedOut = tick > num(K, 'MAX_TICKS');
          return passed ? PASS_GREEN : ((timedOut || v.pass >= 0) ? FAIL_RED : NEUTRAL_TEXT);
        } },
      { label: 'Restarts',
        display: (s, _t, K) => `${Math.round(view(s).validator.restarts)}/${num(K, 'MAX_RESTARTS')}`,
        valueColor: (s, _t, K) =>
          Math.round(view(s).validator.restarts) <= num(K, 'MAX_RESTARTS') ? PASS_GREEN : FAIL_RED },
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
          const accErr = v.completionAccErr >= 0 ? v.completionAccErr : v.accErr;
          return accErr < num(K, 'ACC_ERR_LIMIT') ? PASS_GREEN : FAIL_RED;
        } },
      { label: 'Duration',
        display: (s, tick, K) => {
          const v = view(s).validator;
          const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
          return `${judgedTick}/${num(K, 'MAX_TICKS')}`;
        },
        valueColor: (s, tick, K) => {
          const v = view(s).validator;
          const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
          return judgedTick <= num(K, 'MAX_TICKS') ? PASS_GREEN : FAIL_RED;
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

export default function QuadW1bVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
