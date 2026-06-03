import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
import plannerRatesCode from '../../lib/quad/planner_rates.ts?raw';
import { planner_rates } from '../../lib/quad/planner_rates';
import navigatorRatesCode from '../../lib/quad/navigator_rates.ts?raw';
import { navigator_rates } from '../../lib/quad/navigator_rates';
import navigatorWpCode from '../../lib/quad/navigator_wp.ts?raw';
import { navigator_wp } from '../../lib/quad/navigator_wp';
import fcAcroCode from '../../lib/quad/fc_acro.ts?raw';
import { fc_acro } from '../../lib/quad/fc_acro';
import hwCode from '../../lib/quad/hw.ts?raw';
import { hw } from '../../lib/quad/hw';
import noiseCode from '../../lib/quad/noise.ts?raw';
import { noise } from '../../lib/quad/noise';
import worldCode from '../../lib/quad/world.ts?raw';
import { world } from '../../lib/quad/world';
import { makeLifecycleBlock } from '../../lib/quad/lifecycle';
import { QUAD_DEFAULTS } from '../../lib/quad/consts';
import type { QuadConsts } from '../../lib/quad/consts';
import { QUAD_RATES_ROUTE } from './route';
import QuadRatesVis from './quad-rates.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

// Route: four rates steps forming a rough square in the x-z plane.
//
// Each step issues throttle/yaw/pitch/roll commands interpolated from start
// to end over `duration` ticks. Completion is time-based (planner_rates).
//
// Flying convention (fc_acro sign, internal — not transmitter Mode-2):
//   pitch < 0  → nose down → forward acceleration
//   yaw   > 0  → yaw right (clockwise from above)
//   roll  > 0  → roll right
//
// The route below:
//   step 0 — tilt forward and cruise (+X direction)
//   step 1 — brief pitch-back to decelerate, then yaw right ~90°
//   step 2 — tilt forward and cruise (+Z direction)
//   step 3 — brief pitch-back to decelerate, then yaw right ~90°
//
// These values are starting points — tune pitch/throttle for altitude hold and
// yaw duration for a clean 90° turn at your preferred rate.

export function quadRatesConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  const modelOverrides: Partial<QuadConsts> = {
    REQUIRED_LAPS: 3,
    MAX_TICKS: 2000,
    ACC_ERR_LIMIT: 5000,
    simDuration: 3000,
    ...overrides,
  };

  return {
    modelId: 'racing/quad-rates',
    tickIntervalMs: 50,
    initialState: {
      pos:        { ...vec0 },
      vel:        { ...vec0 },
      acc:        { ...vec0 },
      attitude:   { ...vec0 },
      angularVel: { ...vec0 },
      sensors: {
        pos:        { ...vec0 },
        vel:        { ...vec0 },
        attitude:   { ...vec0 },
        angularVel: { ...vec0 },
      },
      fc: {
        integral: { pos: { ...vec0 } },
      },
      aetr:   { throttle: 0, roll: 0, pitch: 0, yaw: 0 },
      motors: {
        desired: { ...motors0 },
        thrust:  { ...motors0 },
      },
      mission: {
        phase:        0,
        stepIdx:      0,
        ticksInPhase: 0,
        armed:        0,
        step: {
          pos:      { x: 0, y: 5, z: 0 },
          duration: 80,
          throttle: { start: 0.5, end: 0.5 },
          pitch:    { start: -0.015, end: -0.015 },
          yaw:      { start: 0, end: 0 },
          roll:     { start: 0, end: 0 },
        },
        target:   { ...vec0 },
        dist:     0,
        segStart: { ...vec0 },
        segEnd:   { ...vec0 },
      },
      planner_rates: { stepStatus: 0 },
      validator: {
        prevPhase:        0,
        lapsTotal:        0,
        restarts:         0,
        completionTick:   -1,
        completionAccErr: -1,
        currentErr:       0,
        accErr:           0,
        passCount:        0,
        passTotal:        3,
        pass:             -1,
      },
    },
    blocks: [
      makeLifecycleBlock(QUAD_DEFAULTS, QUAD_RATES_ROUTE, modelOverrides),

      // ── Sensor noise ─────────────────────────────────────────────────────
      {
        sourceId:   'noise',
        exportName: 'noise',
        defaultFn:  (s) => noise(s as Parameters<typeof noise>[0]),
        defaultCode: noiseCode,
        mapStateIn:  (s) => ({
          pos:        s.pos,
          vel:        s.vel,
          attitude:   s.attitude,
          angularVel: s.angularVel,
          K:          s.K,
        }),
        mapStateOut: (out, s) => ({ ...s, sensors: out }),
        tickFrequency: 1,
      },

      // ── Mission sequencer ─────────────────────────────────────────────────
      {
        sourceId:   'mission',
        exportName: 'mission',
        defaultFn:  (s) => mission(s as Parameters<typeof mission>[0]),
        defaultCode: missionCode,
        mapStateIn:  (s) => ({
          pos:          (s.sensors as ModelState).pos,
          phase:        (s.mission as ModelState).phase,
          stepIdx:      (s.mission as ModelState).stepIdx,
          ticksInPhase: (s.mission as ModelState).ticksInPhase,
          armed:        (s.mission as ModelState).armed,
          statusWp:     (s.planner_rates as ModelState).stepStatus,
          K:            s.K,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          mission: {
            ...(s.mission as ModelState),
            phase:        out.phase,
            stepIdx:      out.stepIdx,
            ticksInPhase: out.ticksInPhase,
            armed:        out.armed,
            step:         out.step,
            target:       out.target,
            dist:         out.dist,
            segStart:     out.segStart,
            segEnd:       out.segEnd,
          },
        }),
        tickFrequency: 1,
      },

      // ── Time-based step completion ────────────────────────────────────────
      {
        sourceId:   'planner_rates',
        exportName: 'planner_rates',
        defaultFn:  (s) => planner_rates(s as Parameters<typeof planner_rates>[0]),
        defaultCode: plannerRatesCode,
        mapStateIn:  (s) => ({
          ticksInPhase: (s.mission as ModelState).ticksInPhase,
          step:         (s.mission as ModelState).step,
          armed:        (s.mission as ModelState).armed,
          phase:        (s.mission as ModelState).phase,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          planner_rates: { stepStatus: out.stepStatus },
        }),
        tickFrequency: 1,
      },

      // ── Position navigator — TAKEOFF / RTH / LAND phases ─────────────────
      {
        sourceId:   'navigator_wp',
        exportName: 'navigator_wp',
        defaultFn:  (s) => navigator_wp(s as Parameters<typeof navigator_wp>[0]),
        defaultCode: navigatorWpCode,
        mapStateIn:  (s) => ({
          pos:         (s.sensors as ModelState).pos,
          vel:         (s.sensors as ModelState).vel,
          attitude:    (s.sensors as ModelState).attitude,
          angularVel:  (s.sensors as ModelState).angularVel,
          step:        (s.mission as ModelState).step,
          armed:       (s.mission as ModelState).armed,
          integralPos: ((s.fc as ModelState).integral as ModelState).pos,
          aetr:        s.aetr,
          K:           s.K,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          aetr: out.aetr,
          fc: {
            ...(s.fc as ModelState),
            integral: {
              ...(((s.fc as ModelState).integral) as ModelState),
              pos: out.integralPos,
            },
          },
        }),
        tickFrequency: 1,
      },

      // ── RC-style rates navigator — NAVIGATE phase only ────────────────────
      // Runs after navigator_wp and overwrites aetr during PHASE_NAVIGATE.
      // During all other phases it passes aetr through, preserving wp control.
      {
        sourceId:   'navigator_rates',
        exportName: 'navigator_rates',
        defaultFn:  (s) => navigator_rates(s as Parameters<typeof navigator_rates>[0]),
        defaultCode: navigatorRatesCode,
        mapStateIn:  (s) => ({
          ticksInPhase: (s.mission as ModelState).ticksInPhase,
          phase:        (s.mission as ModelState).phase,
          step:         (s.mission as ModelState).step,
          armed:        (s.mission as ModelState).armed,
          aetr:         s.aetr,
        }),
        mapStateOut: (out, s) => ({ ...s, aetr: out.aetr }),
        tickFrequency: 1,
      },

      // ── Inner rate loop ───────────────────────────────────────────────────
      {
        sourceId:   'fc_acro',
        exportName: 'fc_acro',
        defaultFn:  (s) => fc_acro(s as Parameters<typeof fc_acro>[0]),
        defaultCode: fcAcroCode,
        mapStateIn:  (s) => ({
          angularVel: (s.sensors as ModelState).angularVel,
          armed:      (s.mission as ModelState).armed,
          aetrThrottle: (s.aetr as ModelState).throttle,
          aetrRoll:   (s.aetr as ModelState).roll,
          aetrPitch:  (s.aetr as ModelState).pitch,
          aetrYaw:    (s.aetr as ModelState).yaw,
          K:          s.K,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          motors: { ...(s.motors as ModelState), desired: out.motors },
        }),
        tickFrequency: 1,
      },

      // ── Motor spool-up ────────────────────────────────────────────────────
      {
        sourceId:   'hw',
        exportName: 'hw',
        defaultFn:  (s) => hw(s as Parameters<typeof hw>[0]),
        defaultCode: hwCode,
        mapStateIn:  (s) => ({
          motors:     (s.motors as ModelState).desired,
          thrustPrev: (s.motors as ModelState).thrust,
          K:          s.K,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          motors: { ...(s.motors as ModelState), thrust: out.thrust },
        }),
        tickFrequency: 1,
      },

      // ── Physics ───────────────────────────────────────────────────────────
      {
        sourceId:   'world',
        exportName: 'world',
        defaultFn:  (s) => world(s as Parameters<typeof world>[0]),
        defaultCode: worldCode,
        mapStateIn:  (s) => ({
          pos:        s.pos,
          vel:        s.vel,
          attitude:   s.attitude,
          angularVel: s.angularVel,
          thrust:     (s.motors as ModelState).thrust,
          K:          s.K,
        }),
        mapStateOut: (out, s) => ({
          ...s,
          pos:        out.pos,
          vel:        out.vel,
          acc:        out.acc,
          attitude:   out.attitude,
          angularVel: out.angularVel,
        }),
        tickFrequency: 1,
      },
    ],
    vis: QuadRatesVis,
    blocksDiagram: [
      { from: 'lifecycle',       to: 'mission',         label: 'K'          },
      { from: 'noise',           to: 'mission',         label: 'pos'        },
      { from: 'noise',           to: 'navigator_wp',    label: 'sensors'    },
      { from: 'noise',           to: 'fc_acro',         label: 'rates'      },
      { from: 'mission',         to: 'planner_rates',   label: 'step/ticks' },
      { from: 'planner_rates',   to: 'mission',         label: 'status'     },
      { from: 'mission',         to: 'navigator_wp',    label: 'step'       },
      { from: 'mission',         to: 'navigator_rates', label: 'step/ticks' },
      { from: 'navigator_wp',    to: 'navigator_rates', label: 'aetr'       },
      { from: 'navigator_rates', to: 'fc_acro',         label: 'aetr'       },
      { from: 'fc_acro',         to: 'hw',              label: 'motors'     },
      { from: 'hw',              to: 'world',           label: 'throttle'     },
      { from: 'world',           to: 'noise',           label: 'true state' },
    ],
    charts: [
      {
        label: 'Mission',
        series: [
          { var: 'mission.phase',   label: 'phase',   color: '#ffaa00' },
          { var: 'mission.stepIdx', label: 'stepIdx', color: '#00ffaa' },
          { var: 'mission.armed',   label: 'armed',   color: '#aaaaaa' },
        ],
      },
      {
        label: 'AETR sticks',
        series: [
          { var: 'aetr.throttle', label: 'throttle', color: '#ffee44' },
          { var: 'aetr.roll',   label: 'roll',   color: '#ff8844' },
          { var: 'aetr.pitch',  label: 'pitch',  color: '#44ffaa' },
          { var: 'aetr.yaw',    label: 'yaw',    color: '#cc88ff' },
        ],
      },
      {
        label: 'Attitude (rad)',
        series: [
          { var: 'attitude.x', label: 'roll',  color: '#ff8844' },
          { var: 'attitude.z', label: 'pitch', color: '#44ffaa' },
          { var: 'attitude.y', label: 'yaw',   color: '#cc88ff' },
        ],
      },
      {
        label: 'Speed (m/s)',
        series: [{
          label: 'speed',
          color: '#aaffff',
          fn: (s) => {
            const v = s.vel as ModelState;
            return Math.sqrt(
              ((v.x as number) ?? 0) ** 2 +
              ((v.y as number) ?? 0) ** 2 +
              ((v.z as number) ?? 0) ** 2,
            );
          },
        }],
      },
      {
        label: 'Position (true)',
        series: [
          { var: 'pos.x', label: 'x', color: '#ff4444' },
          { var: 'pos.y', label: 'y', color: '#44ff44' },
          { var: 'pos.z', label: 'z', color: '#4488ff' },
        ],
      },
      {
        label: 'Motor power (0–1)',
        series: [
          { var: 'motors.desired.m0', label: 'M0 FL', color: '#ff4444' },
          { var: 'motors.desired.m1', label: 'M1 FR', color: '#ffaa00' },
          { var: 'motors.desired.m2', label: 'M2 RR', color: '#44ff88' },
          { var: 'motors.desired.m3', label: 'M3 RL', color: '#4488ff' },
        ],
      },
      {
        label: 'Angular rates (rad/s)',
        series: [
          { var: 'angularVel.x', label: 'roll rate',  color: '#ff8844' },
          { var: 'angularVel.z', label: 'pitch rate', color: '#44ffaa' },
          { var: 'angularVel.y', label: 'yaw rate',   color: '#cc88ff' },
        ],
      },
      {
        label: 'Track error',
        series: [
          { var: 'validator.currentErr', label: 'current err (m)', color: '#ffaa44' },
          { var: 'validator.accErr',     label: 'accumulated',     color: '#44aaff' },
        ],
      },
    ],
  };
}
