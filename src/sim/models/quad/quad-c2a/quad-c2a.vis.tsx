import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { cornerGroup } from '../../../vis/plugins/cornerGroup';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { sticksOverlay } from '../../../vis/plugins/sticksOverlay';
import { windSock } from '../../../vis/plugins/windSock';
import { toggleOverlay } from '../../../vis/plugins/toggleOverlay';
import { guideLine } from '../../../vis/plugins/guideLine';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { TARGET_HOME, INTERCEPTOR_HOME } from './route';
import { interceptEnabled, windEnabled, noiseEnabled } from './quad-c2a.config';
import type { ModelState } from '../../../engine/types';
import { flashBanner } from '../../../vis/plugins/flashBanner';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Aetr = { throttle: number; yaw: number; pitch: number; roll: number };

interface VehicleState {
  pos: Vec3;
  vel: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  aetr: Aetr;
  mission: { phase: number; stepIdx: number; target: Vec3 };
  planner?: { carrot: Vec3; preGateDone: number };
  validator: {
    lapsTotal: number;
    restarts: number;
    completionTick: number;
    currentErr: number;
    accErr: number;
    passCount: number;
    passTotal: number;
    pass: number;
  };
}
interface C2aState {
  vehicles: { target: VehicleState; interceptor: VehicleState };
  wind: { fx: number; fz: number };
}

const view = (s: ModelState): C2aState => s as unknown as C2aState;

const num = (staticState: ModelState, key: string): number => {
  const K = staticState.K as ModelState | undefined;
  const v = K?.[key];
  return typeof v === 'number' ? v : 0;
};

function speed(v: VehicleState): number {
  return Math.sqrt(v.vel.x ** 2 + v.vel.y ** 2 + v.vel.z ** 2);
}

function windStrength(s: ModelState): number {
  const w = view(s).wind;
  return Math.sqrt(w.fx * w.fx + w.fz * w.fz);
}

function maxWindForce(staticState: ModelState): number {
  return (num(staticState, 'WIND_MAX_N') * num(staticState, 'WIND_FORCE_MAX_PCT')) / 100;
}

// Remaining distance for the target: current leg + all subsequent legs.
function targetRemainingDist(s: ModelState, staticState: ModelState): number {
  const vt = view(s).vehicles.target;
  const stepIdx = Math.round(vt.mission.stepIdx);
  const steps = ((staticState.K as ModelState | undefined)?.stepsTarget ?? []) as Array<{ pos: Vec3 }>;
  if (!steps.length) return 0;

  const safIdx = Math.max(0, Math.min(stepIdx, steps.length - 1));
  const dx0 = steps[safIdx].pos.x - vt.pos.x;
  const dy0 = steps[safIdx].pos.y - vt.pos.y;
  const dz0 = steps[safIdx].pos.z - vt.pos.z;
  let rem = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);

  for (let i = safIdx + 1; i < steps.length; i++) {
    const dx = steps[i].pos.x - steps[i - 1].pos.x;
    const dy = steps[i].pos.y - steps[i - 1].pos.y;
    const dz = steps[i].pos.z - steps[i - 1].pos.z;
    rem += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return rem;
}

const PHASE_LABELS  = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const PASS_GREEN    = '#44dd66';
const FAIL_RED      = '#ff4444';
const NEUTRAL_TEXT  = 'rgba(255, 255, 255, 0.85)';
const TOGGLE_LABEL_W = 66;

const sceneHandler = composeScene(() => {
  const interceptorTrailRef = { enabled: false };
  const targetTrailRef      = { enabled: false };
  const guideRef            = { enabled: true };

  return [
  baseScene({ bg: 0x080810, camera: { pos: [20, 18, -5], lookAt: [8, 4, 8] } }),

  // Home pads
  homePad({ position: [INTERCEPTOR_HOME.x, 0, INTERCEPTOR_HOME.z] }),
  homePad({ position: [TARGET_HOME.x, 0, TARGET_HOME.z] }),

  // ── Interceptor — blue ──
  quadMesh(s => {
    const v = view(s).vehicles.interceptor;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust, phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true, vehicleName: 'intrcpt' }),
  trail(s => view(s).vehicles.interceptor.pos, { visible: interceptorTrailRef, color: 0x4488ff, opacity: 0.7 }),
  guideLine(
    s => view(s).vehicles.interceptor.pos,
    s => view(s).vehicles.interceptor.planner!.carrot,
    { visible: guideRef, color: 0x44ddff, opacity: 0.65, dotColor: 0x44ddff },
  ),

  // ── Target — red ──
  quadMesh(s => {
    const v = view(s).vehicles.target;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust, phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true, bodyColor: 0x661111, bodyEmissive: 0x220404, armColor: 0x774422, vehicleName: 'target' }),
  trail(s => view(s).vehicles.target.pos, { visible: targetTrailRef, color: 0xff4444, opacity: 0.7 }),
  flashBanner({
    text: 'INTERCEPTED', fadeTicks: 40, color: '#ff4444',
    getCounter: s => view(s).vehicles.interceptor.validator.lapsTotal,
  }),
  flashBanner({
    text: 'INTERCEPTION FAILED', fadeTicks: 40, color: '#ffaa22',
    getCounter: s => view(s).vehicles.interceptor.validator.restarts,
  }),

  windSock(s => view(s).wind, { position: [12, 0, -5], getMaxForceN: maxWindForce }),
  waypointTracker(
    s => ({
      waypointIdx: view(s).vehicles.target.mission.stepIdx,
      target:      view(s).vehicles.target.mission.target,
      phase:       view(s).vehicles.target.mission.phase,
    }),
    {
      addWhen:      s => Math.round(view(s).vehicles.target.mission.phase) === 2,
      activeColor:  0xff6666,
      pendingColor: 0xaa2222,
      doneColor:    0x553333,
    },
  ),
  textLabel({
    text: 'Quad C2a\nChase & intercept (first-class target)\nplanner_c2a: velocity-lead / navigator_c2',
    position: [-15, 0, -15],
    fontSize: 30,
  }),

  // ── Left HUD: interceptor ──
  cornerGroup('bottom-left', [
    toggleOverlay('Intercept', interceptEnabled,     { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Wind',      windEnabled,          { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Noise',     noiseEnabled,         { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Trail',     interceptorTrailRef,  { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Guide',     guideRef,             { labelMinWidth: TOGGLE_LABEL_W }),
    infoOverlay({
      title: 'Interceptor', titleColor: '#4488ff',
      rows: [
        { label: 'Intercepts',
          display: (s, _t, K) => `${Math.round(view(s).vehicles.interceptor.validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
          valueColor: (s, tick, K) => {
            const v = view(s).vehicles.interceptor.validator;
            const passed = Math.round(v.lapsTotal) >= num(K, 'REQUIRED_LAPS');
            const timedOut = tick > num(K, 'MAX_TICKS');
            return passed ? PASS_GREEN : (timedOut || v.pass >= 0 ? FAIL_RED : NEUTRAL_TEXT);
          } },
        { label: 'Restarts',
          display: (s, _t, K) => `${Math.round(view(s).vehicles.interceptor.validator.restarts)}/${num(K, 'MAX_RESTARTS')}`,
          valueColor: (s, _t, K) =>
            Math.round(view(s).vehicles.interceptor.validator.restarts) <= num(K, 'MAX_RESTARTS')
              ? PASS_GREEN : FAIL_RED },
        { label: 'Duration',
          display: (s, tick, K) => {
            const ct = view(s).vehicles.interceptor.validator.completionTick;
            return `${ct >= 0 ? ct : tick}/${num(K, 'MAX_TICKS')}`;
          },
          valueColor: (s, tick, K) => {
            const ct = view(s).vehicles.interceptor.validator.completionTick;
            return (ct >= 0 ? ct : tick) <= num(K, 'MAX_TICKS') ? PASS_GREEN : FAIL_RED;
          } },
        { label: 'Wind',
          display: s => `${windStrength(s).toFixed(2)} N`,
          plot: true, value: windStrength, color: '#88ccff' },
        { label: 'Pass',
          display: s => {
            const v = view(s).vehicles.interceptor.validator;
            const count = `${Math.round(v.passCount)}/${Math.round(v.passTotal)}`;
            return v.pass < 0 ? count : `${count} ${v.pass ? 'PASS' : 'FAIL'}`;
          },
          labelColor: s => {
            const p = view(s).vehicles.interceptor.validator.pass;
            return p < 0 ? '#cccc44' : (p ? PASS_GREEN : FAIL_RED);
          } },
      ],
    }),
    sticksOverlay(s => view(s).vehicles.interceptor.aetr),
  ]),

  // ── Right HUD: target ──
  cornerGroup('bottom-right', [
    toggleOverlay('Trail', targetTrailRef, { labelMinWidth: TOGGLE_LABEL_W }),
    infoOverlay({
      title: 'Target', titleColor: '#ff4444',
      rows: [
        { label: 'Speed',
          display: s => `${speed(view(s).vehicles.target).toFixed(2)} m/s`,
          plot: true,
          value: s => speed(view(s).vehicles.target),
          color: '#ff6666' },
        { label: 'Remaining',
          display: (s, _t, K) => `${targetRemainingDist(s, K).toFixed(1)} m` },
        { label: 'Circuits',
          display: s => `${Math.round(view(s).vehicles.target.validator.lapsTotal)}` },
        { label: 'Cur err',
          display: s => `${view(s).vehicles.target.validator.currentErr.toFixed(2)} m`,
          plot: true,
          value: s => view(s).vehicles.target.validator.currentErr,
          color: '#ffaa44' },
        { label: 'Acc err',
          display: s => `${view(s).vehicles.target.validator.accErr.toFixed(0)}` },
        { label: 'Duration',
          display: (_s, tick) => `${tick}` },
      ],
    }),
  ]),
  ];
});

export default function QuadC2aVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
