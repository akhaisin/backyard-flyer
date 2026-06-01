import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { PHASE_NAVIGATE } from '../../lib/quad/mission';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface QuadL4State {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; stepIdx: number; target: Vec3 };
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
const view = (s: ModelState): QuadL4State => s as unknown as QuadL4State;

// Read a numeric constant from the static slice. The overlay's 3rd arg is the
// whole static slice `{ K: {...} }`, so unwrap `.K` before indexing.
const num = (staticState: ModelState, key: string): number => {
  const K = staticState.K as ModelState | undefined;
  const v = K?.[key];
  return typeof v === 'number' ? v : 0;
};

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE'];
const PASS_GREEN = '#44dd66';
const FAIL_RED = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

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
      // Each criterion row shows current / limit, with the limit pulled from the
      // static slice K so it stays in sync with the lifecycle's pass conditions.
      { label: 'Total laps',
        display: (s, _t, K) => `${Math.round(view(s).validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
        valueColor: (s, tick, K) => {
          const v = view(s).validator;
          const passed = Math.round(v.lapsTotal) >= num(K, 'REQUIRED_LAPS');
          const timedOut = tick > num(K, 'MAX_TICKS');
          return passed ? PASS_GREEN : ((timedOut || v.pass >= 0) ? FAIL_RED : NEUTRAL_TEXT);
        } },
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
      { label: 'Pass',
        // While running (pass = -1) show live X/N; after afterSim's verdict
        // append PASS/FAIL.
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

export default function QuadL4Vis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
