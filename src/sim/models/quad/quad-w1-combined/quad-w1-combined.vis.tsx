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
import { cornerGroup } from '../../../vis/plugins/cornerGroup';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { sticksOverlay } from '../../../vis/plugins/sticksOverlay';
import { toggleOverlay } from '../../../vis/plugins/toggleOverlay';
import { W1COMB_A_ROUTE, W1COMB_B_ROUTE, HOME_A, HOME_B } from './route';
import type { WindowStep } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Aetr = { throttle: number; yaw: number; pitch: number; roll: number };
interface VehicleState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  aetr: Aetr;
  mission: { phase: number; stepIdx: number };
  planner: { carrot: Vec3 };
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
interface CombinedState {
  vehicles: { a: VehicleState; b: VehicleState };
  wind: { fx: number; fz: number };
}
const view = (s: ModelState): CombinedState => s as unknown as CombinedState;

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

const toWindows = (route: WindowStep[], p: string): WindowDef[] =>
  route.map((s, i) => ({
    center: s.pos,
    normal: s.normal ?? { x: 1, y: 0, z: 0 },
    width:  s.width  ?? 4,
    height: s.height ?? 4,
    label:  `${p}${i + 1}`,
  }));
const WINDOWS_A = toWindows(W1COMB_A_ROUTE, 'A');
const WINDOWS_B = toWindows(W1COMB_B_ROUTE, 'B');

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const PASS_GREEN = '#44dd66';
const FAIL_RED = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

// Shared overlay rows for one vehicle, colored by its track tint.
const vehicleRows = (pick: (s: ModelState) => VehicleState, tint: string) => [
  { label: 'Total laps',
    display: (s: ModelState, _t: number, K: ModelState) => `${Math.round(pick(s).validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
    valueColor: (s: ModelState, tick: number, K: ModelState) => {
      const v = pick(s).validator;
      const passed = Math.round(v.lapsTotal) >= num(K, 'REQUIRED_LAPS');
      const timedOut = tick > num(K, 'MAX_TICKS');
      return passed ? PASS_GREEN : ((timedOut || v.pass >= 0) ? FAIL_RED : NEUTRAL_TEXT);
    } },
  { label: 'Restarts',
    display: (s: ModelState, _t: number, K: ModelState) => `${Math.round(pick(s).validator.restarts)}/${num(K, 'MAX_RESTARTS')}`,
    valueColor: (s: ModelState, _t: number, K: ModelState) =>
      Math.round(pick(s).validator.restarts) <= num(K, 'MAX_RESTARTS') ? PASS_GREEN : FAIL_RED },
  { label: 'Acc error',
    display: (s: ModelState, _t: number, K: ModelState) => {
      const v = pick(s).validator;
      const accErr = v.completionAccErr >= 0 ? v.completionAccErr : v.accErr;
      return `${accErr.toFixed(0)}/${num(K, 'ACC_ERR_LIMIT')}`;
    },
    valueColor: (s: ModelState, _t: number, K: ModelState) => {
      const v = pick(s).validator;
      const accErr = v.completionAccErr >= 0 ? v.completionAccErr : v.accErr;
      return accErr < num(K, 'ACC_ERR_LIMIT') ? PASS_GREEN : FAIL_RED;
    } },
  { label: 'Duration',
    display: (s: ModelState, tick: number, K: ModelState) => {
      const v = pick(s).validator;
      const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
      return `${judgedTick}/${num(K, 'MAX_TICKS')}`;
    },
    valueColor: (s: ModelState, tick: number, K: ModelState) => {
      const v = pick(s).validator;
      const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
      return judgedTick <= num(K, 'MAX_TICKS') ? PASS_GREEN : FAIL_RED;
    } },
  { label: 'Current err',
    display: (s: ModelState) => `${pick(s).validator.currentErr.toFixed(3)} m`,
    plot: true,
    value: (s: ModelState) => pick(s).validator.currentErr,
    color: tint },
  { label: 'Pass',
    display: (s: ModelState) => {
      const v = pick(s).validator;
      const count = `${Math.round(v.passCount)}/${Math.round(v.passTotal)}`;
      return v.pass < 0 ? count : `${count} ${v.pass ? 'PASS' : 'FAIL'}`;
    },
    labelColor: (s: ModelState) => {
      const p = pick(s).validator.pass;
      return p < 0 ? '#cccc44' : (p ? PASS_GREEN : FAIL_RED);
    } },
];

const sceneHandler = composeScene(() => {
  const guidesRefA = { enabled: true };
  const guidesRefB = { enabled: true };

  return [
  baseScene({ bg: 0x080810, camera: { pos: [24, 20, 24], lookAt: [0, 4, 0] } }),
  homePad({ position: [HOME_A.x, 0, HOME_A.z] }),
  homePad({ position: [HOME_B.x, 0, HOME_B.z] }),

  // ── Vehicle A — blue (w1a carrot) ──
  quadMesh(s => {
    const v = view(s).vehicles.a;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust, phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).vehicles.a.pos, { color: 0x4488ff, opacity: 0.7 }),
  windowGate(
    s => ({ windowIdx: view(s).vehicles.a.mission.stepIdx, phase: view(s).vehicles.a.mission.phase, carrot: view(s).vehicles.a.planner.carrot, pos: view(s).vehicles.a.pos }),
    WINDOWS_A,
    { drawGuides: guidesRefA },
  ),

  // ── Vehicle B — orange (w1b pre-stage) ──
  quadMesh(s => {
    const v = view(s).vehicles.b;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust, phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).vehicles.b.pos, { color: 0xff8800, opacity: 0.7 }),
  windowGate(
    s => ({ windowIdx: view(s).vehicles.b.mission.stepIdx, phase: view(s).vehicles.b.mission.phase, carrot: view(s).vehicles.b.planner.carrot, pos: view(s).vehicles.b.pos }),
    WINDOWS_B,
    { drawGuides: guidesRefB },
  ),

  windSock(s => view(s).wind, { position: [5, 0, 5], getMaxForceN: maxWindForce }),
  textLabel({
    text: 'Quad W1 Combined\nW1a (blue): carrot-and-stick planner\nW1b (orange): pre-stage approach\nshared lib + planner_w1a/w1b / navigator_w1',
    position: [-20, 0, -20],
    fontSize: 48,
  }),
  cornerGroup('bottom-left', [
    toggleOverlay('Guides A', guidesRefA),
    infoOverlay({ title: 'W1a — carrot',    titleColor: '#4488ff', rows: vehicleRows(s => view(s).vehicles.a, '#4488ff') }),
    sticksOverlay(s => view(s).vehicles.a.aetr),
  ]),
  cornerGroup('bottom-right', [
    toggleOverlay('Guides B', guidesRefB),
    infoOverlay({ title: 'W1b — pre-stage', titleColor: '#ff8800', rows: vehicleRows(s => view(s).vehicles.b, '#ff8800') }),
    sticksOverlay(s => view(s).vehicles.b.aetr),
  ]),
  ];
});

export default function QuadW1CombinedVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
