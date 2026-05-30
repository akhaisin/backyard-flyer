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
import { WINDOWS_A } from './blocks/mission_a';
import { WINDOWS_B } from './blocks/mission_b';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
interface VehicleState {
  pos: Vec3;
  attitude: Vec3;
  motors: { thrust: Motors4 };
  mission: { phase: number; windowIdx: number };
  planner: { carrot: Vec3 };
  validator: { lapsTotal: number; lapErr: number; avgErr: number; currentErr: number; misses: number };
}
interface CombinedState {
  vehicles: { a: VehicleState; b: VehicleState };
  wind: { fx: number; fz: number };
}
const view = (s: ModelState): CombinedState => s as unknown as CombinedState;

function windStrength(s: ModelState): number {
  const w = view(s).wind;
  return Math.sqrt(w.fx * w.fx + w.fz * w.fz);
}

const PHASE_LABELS = ['ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'MISSED'];

const sceneHandler = composeScene(() => [
  // Camera from the +x/+z corner looking diagonally across both tracks.
  // Track A is in -x/+z, track B is in +x/-z — opposite quadrants.
  baseScene({ bg: 0x080810, camera: { pos: [24, 20, 24], lookAt: [0, 4, 0] } }),

  // Home pads at each drone's landing position
  homePad({ position: [-15, 0,  15] }),  // track A
  homePad({ position: [ 15, 0, -15] }),  // track B

  // ── Vehicle A — blue (w1a carrot-and-stick) ──────────────────────────────
  quadMesh(s => {
    const v = view(s).vehicles.a;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust,
             phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).vehicles.a.pos, { color: 0x4488ff, opacity: 0.7 }),
  windowGate(
    s => ({
      windowIdx: view(s).vehicles.a.mission.windowIdx,
      phase:     view(s).vehicles.a.mission.phase,
      carrot:    view(s).vehicles.a.planner.carrot,
    }),
    WINDOWS_A,
  ),

  // ── Vehicle B — orange (w1b pre-gate staging) ────────────────────────────
  quadMesh(s => {
    const v = view(s).vehicles.b;
    return { pos: v.pos, attitude: v.attitude, motors: v.motors.thrust,
             phase: v.mission.phase, phaseLabels: PHASE_LABELS };
  }, { frontIndicator: true }),
  trail(s => view(s).vehicles.b.pos, { color: 0xff8800, opacity: 0.7 }),
  windowGate(
    s => ({
      windowIdx: view(s).vehicles.b.mission.windowIdx,
      phase:     view(s).vehicles.b.mission.phase,
      carrot:    view(s).vehicles.b.planner.carrot,
    }),
    WINDOWS_B,
  ),

  // Windsock in the open +x/+z quadrant, immediately visible from default camera
  windSock(s => view(s).wind, { position: [5, 0, 5], maxForceN: 5 }),
  textLabel({
    text: 'Quad W1 Combined\nW1a (blue): carrot-and-stick planner\nW1b (orange): pre-gate staging approach',
    position: [-20, 0, -20],
    fontSize: 48,
  }),
  infoOverlay({
    corner:     'bottom-left',
    title:      'W1a — carrot',
    titleColor: '#4488ff',
    rows: [
      { label: 'Total laps',  display: s => String(Math.round(view(s).vehicles.a.validator.lapsTotal)) },
      { label: 'Misses',      display: s => String(Math.round(view(s).vehicles.a.validator.misses)) },
      { label: 'Current err',
        display: s => `${view(s).vehicles.a.validator.currentErr.toFixed(3)} m`,
        plot: true,
        value: s => view(s).vehicles.a.validator.currentErr,
        color: '#4488ff' },
      { label: 'Lap error',   display: s => `${view(s).vehicles.a.validator.lapErr.toFixed(3)} m` },
      { label: 'Avg error',   display: s => `${view(s).vehicles.a.validator.avgErr.toFixed(3)} m` },
      { label: 'Wind',
        display: s => `${windStrength(s).toFixed(2)} N`,
        plot: true,
        value: windStrength,
        color: '#88ccff' },
    ],
  }),
  infoOverlay({
    corner:     'bottom-right',
    title:      'W1b — pre-gate',
    titleColor: '#ff8800',
    rows: [
      { label: 'Total laps',  display: s => String(Math.round(view(s).vehicles.b.validator.lapsTotal)) },
      { label: 'Misses',      display: s => String(Math.round(view(s).vehicles.b.validator.misses)) },
      { label: 'Current err',
        display: s => `${view(s).vehicles.b.validator.currentErr.toFixed(3)} m`,
        plot: true,
        value: s => view(s).vehicles.b.validator.currentErr,
        color: '#ff8800' },
      { label: 'Lap error',   display: s => `${view(s).vehicles.b.validator.lapErr.toFixed(3)} m` },
      { label: 'Avg error',   display: s => `${view(s).vehicles.b.validator.avgErr.toFixed(3)} m` },
      { label: 'Wind',
        display: s => `${windStrength(s).toFixed(2)} N`,
        plot: true,
        value: windStrength,
        color: '#88ccff' },
    ],
  }),
]);

export default function QuadW1CombinedVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
