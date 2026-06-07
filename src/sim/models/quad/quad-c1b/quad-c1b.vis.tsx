import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { movingTarget } from '../../../vis/plugins/movingTarget';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { cornerGroup } from '../../../vis/plugins/cornerGroup';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { sticksOverlay } from '../../../vis/plugins/sticksOverlay';
import { windSock } from '../../../vis/plugins/windSock';
import { toggleOverlay } from '../../../vis/plugins/toggleOverlay';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Aetr = { throttle: number; yaw: number; pitch: number; roll: number };
interface QuadC1bState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  aetr: Aetr;
  mission: { phase: number; stepIdx: number };
  target_c1:   { pos: Vec3; phase: number };
  planner_c1b: { carrot: Vec3; preGateDone: number };
  wind: { fx: number; fz: number };
  validator: {
    lapsTotal: number;
    restarts: number;
    completionTick: number;
    completionAccErr: number;
    passCount: number;
    passTotal: number;
    pass: number;
  };
}
const view = (s: ModelState): QuadC1bState => s as unknown as QuadC1bState;

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

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const PASS_GREEN   = '#44dd66';
const FAIL_RED     = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

const sceneHandler = composeScene(() => {
  const trailRef  = { enabled: true };
  const guidesRef = { enabled: true };
  const TOGGLE_LABEL_W = 44;

  return [
  baseScene({ bg: 0x080810, camera: { pos: [12, 14, 18], lookAt: [0, 4, 0] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos, { visible: trailRef }),
  movingTarget(
    s => view(s).target_c1,
    s => view(s).pos,
    { drawGuide: guidesRef, getGuideTarget: s => view(s).planner_c1b.carrot },
  ),
  windSock(s => view(s).wind, { getMaxForceN: maxWindForce }),
  textLabel({
    text: 'Quad C1b\nPre-staged chase\ntarget_c1 + planner_c1b / navigator_w1',
    position: [-16, 0, 0],
    fontSize: 36,
  }),
  cornerGroup('bottom-left', [
    toggleOverlay('Trail',  trailRef,  { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Guides', guidesRef, { labelMinWidth: TOGGLE_LABEL_W }),
    infoOverlay({
      rows: [
        { label: 'Intercept rounds',
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
  ]),
  sticksOverlay(s => view(s).aetr, { corner: 'bottom-right' }),
  ];
});

export default function QuadC1bVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
