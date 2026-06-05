import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { windSock } from '../../../vis/plugins/windSock';
import { textLabel } from '../../../vis/plugins/textLabel';
import { cornerGroup } from '../../../vis/plugins/cornerGroup';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { sticksOverlay } from '../../../vis/plugins/sticksOverlay';
import { toggleOverlay } from '../../../vis/plugins/toggleOverlay';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Aetr = { throttle: number; yaw: number; pitch: number; roll: number };
interface QuadW1aState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  aetr: Aetr;
  mission: { phase: number; stepIdx: number };
  planner_w1a: { carrot: Vec3 };
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
const view = (s: ModelState): QuadW1aState => s as unknown as QuadW1aState;

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

// Build gate frames from K.steps at runtime so edits to the lifecycle block
// are reflected in the vis without a page reload.
const getWindows = (staticState: ModelState) => {
  const steps = ((staticState.K as ModelState | undefined)?.steps ?? []) as Array<{
    pos: Vec3; normal?: Vec3; width?: number; height?: number;
  }>;
  return steps
    .filter(s => s.normal != null)
    .map((s, i) => ({
      center: s.pos,
      normal: s.normal!,
      width:  s.width  ?? 5,
      height: s.height ?? 5,
      label:  `W${i + 1}`,
    }));
};

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const PASS_GREEN = '#44dd66';
const FAIL_RED = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

const sceneHandler = composeScene(() => {
  // Shared mutable ref: created once per vis instance in the factory closure.
  // Both toggleOverlay (writes) and windowGate (reads) hold a reference to the
  // same object — no subscriptions or signals needed.
  const guidesRef = { enabled: true };

  return [
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
      carrot:    view(s).planner_w1a.carrot,
      pos:       view(s).pos,
    }),
    getWindows,
    { drawGuides: guidesRef },
  ),
  windSock(s => view(s).wind, { getMaxForceN: maxWindForce }),
  textLabel({
    text: 'Quad W1a\nWindow gates + carrot-and-stick planner\nshared lib + planner_w1a / navigator_w1',
    position: [-18, 0, 0],
    fontSize: 36,
  }),
  cornerGroup('bottom-left', [
    toggleOverlay('Guides', guidesRef),
    infoOverlay({
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
  ]),
  sticksOverlay(s => view(s).aetr, { corner: 'bottom-right' }),
  ];
});

export default function QuadW1aVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
