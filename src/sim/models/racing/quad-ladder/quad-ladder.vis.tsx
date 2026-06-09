import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { homePad } from '../../../vis/plugins/homePad';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { windowGate } from '../../../vis/plugins/windowGate';
import { quadMesh } from '../../../vis/plugins/quadMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import { cornerGroup } from '../../../vis/plugins/cornerGroup';
import { infoOverlay } from '../../../vis/plugins/infoOverlay';
import { sticksOverlay } from '../../../vis/plugins/sticksOverlay';
import { missionLogOverlay } from '../../../vis/plugins/missionLogOverlay';
import { toggleOverlay } from '../../../vis/plugins/toggleOverlay';
import { GATES, GUIDE_GATES } from './route';
import { debugEnabled } from './quad-ladder.config';
import { STEP_TYPE_CTURN } from '../../lib/quad/consts';
import type { ModelState } from '../../../engine/types';

type Vec3    = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Aetr    = { throttle: number; roll: number; pitch: number; yaw: number };

interface QuadLadderState {
  pos:      Vec3;
  attitude: Vec3;
  motors:   { thrust: Motors4 };
  aetr:     Aetr;
  mission:  {
    phase: number;
    stepIdx: number;
    step: {
      stepType: number;
      pos: { x: number; y: number; z: number };
      threshold: number;
      durationTicks: number;
      waypoints?: { x: number; y: number; z: number }[];
    };
  };
  validator: {
    lapsTotal:      number;
    completionTick: number;
    pass:           number;
  };
}
const view = (s: ModelState): QuadLadderState => s as unknown as QuadLadderState;

const num = (staticState: ModelState, key: string): number => {
  const K = staticState.K as ModelState | undefined;
  const v = K?.[key];
  return typeof v === 'number' ? v : 0;
};

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART'];
const TOGGLE_LABEL_W = 78; // px — fits the widest label ("Waypoints") so switches align
const PASS_GREEN   = '#44dd66';
const FAIL_RED     = '#ff4444';
const NEUTRAL_TEXT = 'rgba(255, 255, 255, 0.85)';

// Route is 8 steps: [WP_entry, CTURN] × 3 levels, with inter-level staging WPs.
// Steps 0–1  → Level 1 (gate index 0: M1 / G1)
// Steps 2–4  → Level 2 (gate index 1: M2 / G2)
// Steps 5–7  → Level 3 (gate index 2: M3 / G3)
const toGateIdx = (stepIdx: number): number => stepIdx < 2 ? 0 : stepIdx < 5 ? 1 : 2;

const PHASE_NAVIGATE = 2;
const isNavigateStep = (s: ModelState): boolean =>
  Math.round(view(s).mission.phase) === PHASE_NAVIGATE;

const sceneHandler = composeScene(() => {
  const guidesRef    = { enabled: true };
  const trailRef     = { enabled: true };
  const waypointsRef  = { enabled: true };
  const numbersRef   = { enabled: true };

  return [
  baseScene({ bg: 0x080810, camera: { pos: [-10, 20, 25], lookAt: [12, 5, 0] } }),
  homePad(),
  quadMesh(s => {
    const q = view(s);
    return { pos: q.pos, attitude: q.attitude, motors: q.motors.thrust, phase: q.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).pos, { visible: trailRef }),
  // Markers for route-step waypoints — WP steps drop one at step.pos, CTURN steps
  // drop their 3 arc waypoints. Gated to NAVIGATE so takeoff/RTH/home and restart
  // anchors don't scatter spheres along the whole track.
  waypointTracker(
    s => {
      const m = view(s).mission;
      return {
        waypointIdx: m.stepIdx,
        target:      m.step.pos,
        waypoints:   m.step.waypoints,
        phase:       m.phase,
      };
    },
    { addWhen: isNavigateStep, doneColor: 0x335577, numbered: numbersRef, visible: waypointsRef },
  ),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).pos,
      pos:       view(s).pos,
    }),
    GATES,
    { drawGuides: guidesRef },
  ),
  windowGate(
    s => ({
      windowIdx: toGateIdx(view(s).mission.stepIdx),
      phase:     view(s).mission.phase,
      carrot:    view(s).pos,
    }),
    GUIDE_GATES,
    { opacity: 0.25, noCarrot: false },
  ),
  textLabel({
    text: 'Quad Ladder\nThree-gate vertical FPV ladder\ncoordinated-turn arcs through each gate pair',
    position: [-15, 0, -15],
    fontSize: 36,
  }),
  cornerGroup('bottom-left', [
    toggleOverlay('Debug',     debugEnabled, { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Trail',     trailRef,     { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Guides',    guidesRef,    { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Waypoints', waypointsRef, { labelMinWidth: TOGGLE_LABEL_W }),
    toggleOverlay('Numbers',   numbersRef,   { labelMinWidth: TOGGLE_LABEL_W }),
    infoOverlay({
      rows: [
        {
          label:   'Total laps',
          display: (s, _t, K) => `${Math.round(view(s).validator.lapsTotal)}/${num(K, 'REQUIRED_LAPS')}`,
          valueColor: (s, tick, K) => {
            const v = view(s).validator;
            const passed   = Math.round(v.lapsTotal) >= num(K, 'REQUIRED_LAPS');
            const timedOut = tick > num(K, 'MAX_TICKS');
            return passed ? PASS_GREEN : ((timedOut || v.pass >= 0) ? FAIL_RED : NEUTRAL_TEXT);
          },
        },
        {
          label:   'Duration',
          display: (s, tick, K) => {
            const v = view(s).validator;
            const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
            return `${judgedTick}/${num(K, 'MAX_TICKS')}`;
          },
          valueColor: (s, tick, K) => {
            const v = view(s).validator;
            const judgedTick = v.completionTick >= 0 ? v.completionTick : tick;
            return judgedTick <= num(K, 'MAX_TICKS') ? PASS_GREEN : FAIL_RED;
          },
        },
      ],
    }),
  ]),
  cornerGroup('top-right', [
    missionLogOverlay(s => view(s).mission, {
      stepsEntries: 8,
      handlers: {
        step: {
          [STEP_TYPE_CTURN]: (step) => [
            `ticks ${step.durationTicks ?? '?'}${step.debug === 1 ? ' DEBUG' : ''}`,
            ...(step.waypoints ?? []).map(
              p => `  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`
            ),
          ],
        },
      },
    }),
  ]),
  sticksOverlay(s => view(s).aetr),
  ];
});

export default function QuadLadderVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
