import missionCode from '../../lib/quad/mission.ts?raw';
import { mission } from '../../lib/quad/mission';
import plannerWpCode from '../../lib/quad/planner_wp.ts?raw';
import { planner_wp } from '../../lib/quad/planner_wp';
import plannerC2aCode from '../../lib/quad/planner_c2a.ts?raw';
import { planner_c2a } from '../../lib/quad/planner_c2a';
import navigatorC2Code from '../../lib/quad/navigator_c2.ts?raw';
import { navigator_c2 } from '../../lib/quad/navigator_c2';
import navigatorWpCode from '../../lib/quad/navigator_wp.ts?raw';
import { navigator_wp } from '../../lib/quad/navigator_wp';
import fcAcroCode from '../../lib/quad/fc_acro.ts?raw';
import { fc_acro } from '../../lib/quad/fc_acro';
import hwCode from '../../lib/quad/hw.ts?raw';
import { hw } from '../../lib/quad/hw';
import noiseCode from '../../lib/quad/noise.ts?raw';
import { noise } from '../../lib/quad/noise';
import windCode from '../../lib/quad/wind.ts?raw';
import { wind } from '../../lib/quad/wind';
import worldCode from '../../lib/quad/world.ts?raw';
import { world } from '../../lib/quad/world';
import { makeC2aLifecycleBlock } from './lifecycle';
import { QUAD_DEFAULTS, STEP_TYPE_WP } from '../../lib/quad/consts';
import type { QuadConsts } from '../../lib/quad/consts';
import {
  C2A_TARGET_ROUTE,
  C2A_INTERCEPTOR_STEP,
  TARGET_HOME,
  INTERCEPTOR_HOME,
} from './route';
import QuadC2aVis from './quad-c2a.vis';
import type { ModelConfig, ModelState } from '../../../engine/types';

// ── Intercept toggle — shared mutable ref between vis and mapStateIn ────────
// The vis imports this ref and wires it to toggleOverlay('Intercept', ...).
// mission_interceptor.mapStateIn reads .enabled each tick, so the toggle takes
// effect without any engine changes.
export const interceptEnabled = { enabled: true };
export const windEnabled      = { enabled: true };
export const noiseEnabled     = { enabled: true };

// ── State accessors ─────────────────────────────────────────────────────────

const vt = (s: ModelState): ModelState => ((s.vehicles as ModelState).target      as ModelState);
const vi = (s: ModelState): ModelState => ((s.vehicles as ModelState).interceptor as ModelState);

const writeVehicle = (
  s: ModelState,
  key: 'target' | 'interceptor',
  patch: ModelState,
): ModelState => ({
  ...s,
  vehicles: { ...(s.vehicles as ModelState), [key]: { ...((s.vehicles as ModelState)[key] as ModelState), ...patch } },
});

// Per-vehicle K accessors. Each vehicle's K bag (published by the lifecycle's
// beforeSim) already contains the correct HOME_X/Z and steps, so these are
// the only K views needed — no separate mission-K wrappers required.
const targetK      = (s: ModelState): ModelState => (s.K as ModelState).target      as ModelState;
const interceptorK = (s: ModelState): ModelState => (s.K as ModelState).interceptor as ModelState;


// ── Initial state helpers ────────────────────────────────────────────────────

const motors0 = { m0: 0, m1: 0, m2: 0, m3: 0 };
const vec0    = { x: 0, y: 0, z: 0 };

const validatorInit = {
  prevPhase:          0,
  lapsTotal:          0,
  restarts:           0,
  completionTick:     -1,
  completionAccErr:   -1,
  currentErr:         0,
  accErr:             0,
  capturedC2aStatus:  -1,
  capturedWpStatus:   -1,
  passCount:          0,
  passTotal:          2,
  pass:              -1,
};

function targetVehicleInit(): ModelState {
  const firstStep = C2A_TARGET_ROUTE[0];
  const home = TARGET_HOME;
  return {
    pos:        { x: home.x, y: 0, z: home.z },
    vel:        { ...vec0 },
    acc:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
    sensors: {
      pos:        { x: home.x, y: 0, z: home.z },
      vel:        { ...vec0 },
      attitude:   { ...vec0 },
      angularVel: { ...vec0 },
    },
    fc: { integral: { pos: { ...vec0 } }, yawMeas: 0 },
    aetr:   { throttle: 0, roll: 0, pitch: 0, yaw: 0 },
    motors: { desired: { ...motors0 }, thrust: { ...motors0 } },
    mission: {
      phase: 0, stepIdx: 0, ticksInPhase: 0, armed: 0,
      step: { pos: { ...firstStep.pos }, stepType: STEP_TYPE_WP, threshold: firstStep.threshold },
      target:   { ...firstStep.pos },
      dist:     0,
      segStart: { x: home.x, y: 5, z: home.z },
      segEnd:   { ...firstStep.pos },
    },
    planner_wp: { stepStatus: 0 },
    validator: { ...validatorInit },
  };
}

function interceptorVehicleInit(): ModelState {
  const step = C2A_INTERCEPTOR_STEP;
  return {
    pos:        { x: INTERCEPTOR_HOME.x, y: 0, z: INTERCEPTOR_HOME.z },
    vel:        { ...vec0 },
    acc:        { ...vec0 },
    attitude:   { ...vec0 },
    angularVel: { ...vec0 },
    sensors: {
      pos:        { x: INTERCEPTOR_HOME.x, y: 0, z: INTERCEPTOR_HOME.z },
      vel:        { ...vec0 },
      attitude:   { ...vec0 },
      angularVel: { ...vec0 },
    },
    fc: { integral: { pos: { ...vec0 } }, yawMeas: 0 },
    aetr:   { throttle: 0, roll: 0, pitch: 0, yaw: 0 },
    motors: { desired: { ...motors0 }, thrust: { ...motors0 } },
    mission: {
      phase: 0, stepIdx: 0, ticksInPhase: 0, armed: 0,
      step: { pos: { ...step.pos }, stepType: 6, threshold: step.threshold },
      target:   { ...step.pos },
      dist:     0,
      segStart: { x: INTERCEPTOR_HOME.x, y: 5, z: INTERCEPTOR_HOME.z },
      segEnd:   { ...step.pos },
    },
    planner: { carrot: { ...vec0 }, yawSetpoint: 0, stepStatus: 0, preGateDone: 0,
               prevTargetPos1: { ...vec0 } },
    planner_wp: { stepStatus: 0 },
    validator: { ...validatorInit },
  };
}

// ── Per-vehicle block factories ──────────────────────────────────────────────

// Target vehicle: WP planner for completion checks; navigator_wp for stable WP tracking.
function targetBlocks() {
  return [
    {
      sourceId: 'noise_target',
      exportName: 'noise',
      defaultFn: (s: ModelState) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn: (s: ModelState) => ({
        pos: vt(s).pos, vel: vt(s).vel, attitude: vt(s).attitude, angularVel: vt(s).angularVel,
        K: noiseEnabled.enabled
          ? targetK(s)
          : { ...(targetK(s) as ModelState), POS_STD: 0, VEL_STD: 0, ATT_STD: 0, ANG_VEL_STD: 0 },
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', { sensors: out }),
      tickFrequency: 1,
    },
    {
      sourceId: 'mission_target',
      exportName: 'mission',
      defaultFn: (s: ModelState) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s: ModelState) => {
        const iPhase    = Math.round((vi(s).mission as ModelState).phase as number);
        const intercept = interceptEnabled.enabled;
        return {
          pos:          (vt(s).sensors as ModelState).pos,
          phase:        (vt(s).mission as ModelState).phase,
          stepIdx:      (vt(s).mission as ModelState).stepIdx,
          ticksInPhase: (vt(s).mission as ModelState).ticksInPhase,
          armed:        (vt(s).mission as ModelState).armed,
          statusWp:     (vt(s).planner_wp as ModelState).stepStatus,
          // Abort target when interceptor is mid-RTH so both reset together.
          forceRTH:     (intercept && iPhase >= 3 && iPhase <= 5) ? 1 : 0,
          K:            targetK(s),
        };
      },
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', {
        mission: {
          ...(vt(s).mission as ModelState),
          phase: out.phase, stepIdx: out.stepIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, step: out.step, target: out.target, dist: out.dist,
          segStart: out.segStart, segEnd: out.segEnd,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_wp_target',
      exportName: 'planner_wp',
      defaultFn: (s: ModelState) => planner_wp(s as Parameters<typeof planner_wp>[0]),
      defaultCode: plannerWpCode,
      mapStateIn: (s: ModelState) => ({
        pos:   (vt(s).sensors as ModelState).pos,
        step:  (vt(s).mission as ModelState).step,
        armed: (vt(s).mission as ModelState).armed,
        phase: (vt(s).mission as ModelState).phase,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', { planner_wp: { stepStatus: out.stepStatus } }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_target',
      exportName: 'navigator_wp',
      defaultFn: (s: ModelState) => navigator_wp(s as Parameters<typeof navigator_wp>[0]),
      defaultCode: navigatorWpCode,
      mapStateIn: (s: ModelState) => ({
        pos:         (vt(s).sensors as ModelState).pos,
        vel:         (vt(s).sensors as ModelState).vel,
        attitude:    (vt(s).sensors as ModelState).attitude,
        angularVel:  (vt(s).sensors as ModelState).angularVel,
        step:        (vt(s).mission as ModelState).step,
        armed:       (vt(s).mission as ModelState).armed,
        integralPos: ((vt(s).fc as ModelState).integral as ModelState).pos,
        aetr:        vt(s).aetr,
        K:           targetK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', {
        aetr: out.aetr,
        fc: {
          ...(vt(s).fc as ModelState),
          integral: { ...((vt(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_acro_target',
      exportName: 'fc_acro',
      defaultFn: (s: ModelState) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s: ModelState) => ({
        angularVel:   (vt(s).sensors as ModelState).angularVel,
        armed:        (vt(s).mission as ModelState).armed,
        aetrThrottle: (vt(s).aetr as ModelState).throttle,
        aetrRoll:     (vt(s).aetr as ModelState).roll,
        aetrPitch:    (vt(s).aetr as ModelState).pitch,
        aetrYaw:      (vt(s).aetr as ModelState).yaw,
        K:            targetK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', {
        motors: { ...(vt(s).motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_target',
      exportName: 'hw',
      defaultFn: (s: ModelState) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s: ModelState) => ({
        motors:     (vt(s).motors as ModelState).desired,
        thrustPrev: (vt(s).motors as ModelState).thrust,
        K:          targetK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', {
        motors: { ...(vt(s).motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_target',
      exportName: 'world',
      defaultFn: (s: ModelState) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s: ModelState) => ({
        pos: vt(s).pos, vel: vt(s).vel, attitude: vt(s).attitude, angularVel: vt(s).angularVel,
        thrust: (vt(s).motors as ModelState).thrust,
        windFx: (s.wind as ModelState).fx,
        windFz: (s.wind as ModelState).fz,
        K:      targetK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'target', {
        pos: out.pos, vel: out.vel, acc: out.acc, attitude: out.attitude, angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },
  ];
}

// Interceptor vehicle: planner_c2a (pre-stage + pursuit) reads target's live pos.
function interceptorBlocks() {
  return [
    {
      sourceId: 'noise_interceptor',
      exportName: 'noise',
      defaultFn: (s: ModelState) => noise(s as Parameters<typeof noise>[0]),
      defaultCode: noiseCode,
      mapStateIn: (s: ModelState) => ({
        pos: vi(s).pos, vel: vi(s).vel, attitude: vi(s).attitude, angularVel: vi(s).angularVel,
        K: noiseEnabled.enabled
          ? interceptorK(s)
          : { ...(interceptorK(s) as ModelState), POS_STD: 0, VEL_STD: 0, ATT_STD: 0, ANG_VEL_STD: 0 },
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', { sensors: out }),
      tickFrequency: 1,
    },
    {
      sourceId: 'mission_interceptor',
      exportName: 'mission',
      defaultFn: (s: ModelState) => mission(s as Parameters<typeof mission>[0]),
      defaultCode: missionCode,
      mapStateIn: (s: ModelState) => {
        const intercept = interceptEnabled.enabled;
        // When toggle is OFF: inflate ARMING_TICKS so the interceptor never leaves
        // ARMING. forceRTH handles TAKEOFF/NAVIGATE; holdDone handles DONE.
        const K = !intercept
          ? { ...(interceptorK(s) as ModelState), ARMING_TICKS: 999999 }
          : interceptorK(s);
        return {
          pos:          (vi(s).sensors as ModelState).pos,
          phase:        (vi(s).mission as ModelState).phase,
          stepIdx:      (vi(s).mission as ModelState).stepIdx,
          ticksInPhase: (vi(s).mission as ModelState).ticksInPhase,
          armed:        (vi(s).mission as ModelState).armed,
          statusWp:     (vi(s).planner as ModelState).stepStatus,
          statusReturn: (vi(s).planner_wp as ModelState).stepStatus,
          forceRTH:     !intercept ? 1 : 0,
          holdDone:     !intercept ? 1 : 0,
          K,
        };
      },
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        mission: {
          ...(vi(s).mission as ModelState),
          phase: out.phase, stepIdx: out.stepIdx, ticksInPhase: out.ticksInPhase,
          armed: out.armed, step: out.step, target: out.target, dist: out.dist,
          segStart: out.segStart, segEnd: out.segEnd,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_c2a',
      exportName: 'planner_c2a',
      defaultFn: (s: ModelState) => planner_c2a(s as Parameters<typeof planner_c2a>[0]),
      defaultCode: plannerC2aCode,
      mapStateIn: (s: ModelState) => ({
        pos:             (vi(s).sensors as ModelState).pos,
        targetPos:       vt(s).pos,                            // true physics pos of target
        prevTargetPos1:  (vi(s).planner as ModelState).prevTargetPos1,
        targetPhase:     (vt(s).mission as ModelState).phase,
        step:            (vi(s).mission as ModelState).step,
        armed:           (vi(s).mission as ModelState).armed,
        phase:           (vi(s).mission as ModelState).phase,
        yawSetpoint:     (vi(s).planner as ModelState).yawSetpoint,
        preGateDone:     (vi(s).planner as ModelState).preGateDone,
        K:               interceptorK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        planner: {
          carrot: out.carrot, yawSetpoint: out.yawSetpoint,
          stepStatus: out.stepStatus, preGateDone: out.preGateDone,
          prevTargetPos1: out.prevTargetPos1,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'planner_wp_interceptor',
      exportName: 'planner_wp',
      defaultFn: (s: ModelState) => planner_wp(s as Parameters<typeof planner_wp>[0]),
      defaultCode: plannerWpCode,
      mapStateIn: (s: ModelState) => ({
        pos:   (vi(s).sensors as ModelState).pos,
        step:  (vi(s).mission as ModelState).step,
        armed: (vi(s).mission as ModelState).armed,
        phase: (vi(s).mission as ModelState).phase,
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', { planner_wp: { stepStatus: out.stepStatus } }),
      tickFrequency: 1,
    },
    {
      sourceId: 'navigator_interceptor',
      exportName: 'navigator_c2',
      defaultFn: (s: ModelState) => navigator_c2(s as Parameters<typeof navigator_c2>[0]),
      defaultCode: navigatorC2Code,
      mapStateIn: (s: ModelState) => ({
        pos:         (vi(s).sensors as ModelState).pos,
        vel:         (vi(s).sensors as ModelState).vel,
        attitude:    (vi(s).sensors as ModelState).attitude,
        carrot:      (vi(s).planner as ModelState).carrot,
        yawSetpoint: (vi(s).planner as ModelState).yawSetpoint,
        armed:       (vi(s).mission as ModelState).armed,
        integralPos: ((vi(s).fc as ModelState).integral as ModelState).pos,
        yawMeas:     (vi(s).fc as ModelState).yawMeas,
        aetr:        vi(s).aetr,
        K:           interceptorK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        aetr: out.aetr,
        fc: {
          ...(vi(s).fc as ModelState),
          integral: { ...((vi(s).fc as ModelState).integral as ModelState), pos: out.integralPos },
          yawMeas:  out.yawMeas,
        },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'fc_acro_interceptor',
      exportName: 'fc_acro',
      defaultFn: (s: ModelState) => fc_acro(s as Parameters<typeof fc_acro>[0]),
      defaultCode: fcAcroCode,
      mapStateIn: (s: ModelState) => ({
        angularVel:   (vi(s).sensors as ModelState).angularVel,
        armed:        (vi(s).mission as ModelState).armed,
        aetrThrottle: (vi(s).aetr as ModelState).throttle,
        aetrRoll:     (vi(s).aetr as ModelState).roll,
        aetrPitch:    (vi(s).aetr as ModelState).pitch,
        aetrYaw:      (vi(s).aetr as ModelState).yaw,
        K:            interceptorK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        motors: { ...(vi(s).motors as ModelState), desired: out.motors },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'hw_interceptor',
      exportName: 'hw',
      defaultFn: (s: ModelState) => hw(s as Parameters<typeof hw>[0]),
      defaultCode: hwCode,
      mapStateIn: (s: ModelState) => ({
        motors:     (vi(s).motors as ModelState).desired,
        thrustPrev: (vi(s).motors as ModelState).thrust,
        K:          interceptorK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        motors: { ...(vi(s).motors as ModelState), thrust: out.thrust },
      }),
      tickFrequency: 1,
    },
    {
      sourceId: 'world_interceptor',
      exportName: 'world',
      defaultFn: (s: ModelState) => world(s as Parameters<typeof world>[0]),
      defaultCode: worldCode,
      mapStateIn: (s: ModelState) => ({
        pos: vi(s).pos, vel: vi(s).vel, attitude: vi(s).attitude, angularVel: vi(s).angularVel,
        thrust: (vi(s).motors as ModelState).thrust,
        windFx: (s.wind as ModelState).fx,
        windFz: (s.wind as ModelState).fz,
        K:      interceptorK(s),
      }),
      mapStateOut: (out: ModelState, s: ModelState) => writeVehicle(s, 'interceptor', {
        pos: out.pos, vel: out.vel, acc: out.acc, attitude: out.attitude, angularVel: out.angularVel,
      }),
      tickFrequency: 1,
    },
  ];
}

// ── Config factory ────────────────────────────────────────────────────────────

export function quadC2aConfig(overrides?: Partial<QuadConsts>): ModelConfig {
  // Shared overrides applied to both vehicles (sim lifecycle, validator, wind, noise).
  const sharedOverrides: Partial<QuadConsts> = {
    ACC_ERR_LIMIT: 999999,
    MAX_RESTARTS:  15,
    REQUIRED_LAPS: 2,
    MAX_TICKS:     8000,
    simDuration:   10000,
    WIND_FORCE_MAX_PCT: 10,
    WIND_MAX_N:         2,
  };

  // Interceptor: full performance.
  const interceptorConsts: QuadConsts = {
    ...QUAD_DEFAULTS,
    ...sharedOverrides,
    KI_POS:      0.3,
    MAX_TILT:    0.4,
    KP_YAW_OUTER: 5.0,
    YAW_MEAS_LPF: 0.35,
    POS_STD:     0.0025,
    VEL_STD:     0.0025,
    HOME_X:      INTERCEPTOR_HOME.x,
    HOME_Z:      INTERCEPTOR_HOME.z,
    ...overrides,
  };

  // Target: 50% slower (MAX_TILT halved), otherwise same as interceptor.
  const targetConsts: QuadConsts = {
    ...interceptorConsts,
    MAX_TILT: interceptorConsts.MAX_TILT * 0.5,
    HOME_X:   TARGET_HOME.x,
    HOME_Z:   TARGET_HOME.z,
  };

  return {
    modelId: 'quad/quad-c2a',
    tickIntervalMs: 50,
    initialState: {
      wind: { fx: 0, fz: 0, ticksLeft: 0, season: 0 },
      vehicles: {
        target:      targetVehicleInit(),
        interceptor: interceptorVehicleInit(),
      },
    },
    blocks: [
      makeC2aLifecycleBlock(interceptorConsts, targetConsts, C2A_TARGET_ROUTE, C2A_INTERCEPTOR_STEP),
      {
        sourceId: 'wind',
        exportName: 'wind',
        defaultFn: (s) => wind(s as Parameters<typeof wind>[0]),
        defaultCode: windCode,
        mapStateIn: (s) => {
          const base = { ...(s.wind as ModelState), K: s.K };
          if (windEnabled.enabled) return base;
          return {
            ...base,
            ticksLeft: 0,
            K: { ...(s.K as ModelState), WIND_FORCE_INITIAL_PCT: 0, WIND_FORCE_MAX_PCT: 0 },
          };
        },
        mapStateOut: (out, s) => ({ ...s, wind: out }),
        tickFrequency: 1,
      },
      ...targetBlocks(),
      ...interceptorBlocks(),
    ],
    vis: QuadC2aVis,
    blocksDiagram: [
      { from: 'lifecycle',             to: 'mission_target',        label: 'K.target'     },
      { from: 'lifecycle',             to: 'mission_interceptor',   label: 'K.interceptor'},
      // Wind couples into both physics blocks
      { from: 'wind',                  to: 'world_target',          label: 'force'        },
      { from: 'wind',                  to: 'world_interceptor',     label: 'force'        },
      // ── Target ──────────────────────────────────────────────────────────────────────
      { from: 'world_target',          to: 'noise_target',          label: 'true state'   },
      { from: 'noise_target',          to: 'mission_target',        label: 'pos'          },
      // { from: 'noise_target',          to: 'navigator_target',      label: 'sensors'      },
      // { from: 'noise_target',          to: 'fc_acro_target',        label: 'rates'        },
      { from: 'mission_target',        to: 'planner_wp_target',     label: 'step/phase'   },
      { from: 'planner_wp_target',     to: 'mission_target',        label: 'status'       },
      { from: 'mission_target',        to: 'navigator_target',      label: 'step'         },
      { from: 'navigator_target',      to: 'fc_acro_target',        label: 'aetr'         },
      { from: 'fc_acro_target',        to: 'hw_target',             label: 'motors'       },
      { from: 'hw_target',             to: 'world_target',          label: 'throttle'     },
      // ── Interceptor ─────────────────────────────────────────────────────────────────
      { from: 'world_interceptor',     to: 'noise_interceptor',     label: 'true state'   },
      { from: 'noise_interceptor',     to: 'mission_interceptor',   label: 'pos'          },
      // { from: 'noise_interceptor',     to: 'navigator_interceptor', label: 'sensors'      },
      // { from: 'noise_interceptor',     to: 'fc_acro_interceptor',   label: 'rates'        },
      { from: 'mission_interceptor',   to: 'planner_c2a',           label: 'step/phase'   },
      { from: 'planner_c2a',           to: 'mission_interceptor',   label: 'status'       },
      { from: 'mission_interceptor',   to: 'planner_wp_interceptor',label: 'anchor'       },
      { from: 'planner_wp_interceptor',to: 'mission_interceptor',   label: 'return'       },
      { from: 'planner_c2a',           to: 'navigator_interceptor', label: 'carrot+yaw'   },
      { from: 'navigator_interceptor', to: 'fc_acro_interceptor',   label: 'aetr'         },
      { from: 'fc_acro_interceptor',   to: 'hw_interceptor',        label: 'motors'       },
      { from: 'hw_interceptor',        to: 'world_interceptor',     label: 'throttle'     },
      // ── Cross-vehicle ────────────────────────────────────────────────────────────────
      // { from: 'world_target',          to: 'planner_c2a',           label: 'target pos'   },
      // { from: 'mission_target',        to: 'planner_c2a',           label: 'target phase' },
      // { from: 'mission_interceptor',   to: 'mission_target',        label: 'RTH phase'    },
    ],
    charts: [
      {
        label: 'Intercepts / target circuits',
        series: [
          { var: 'vehicles.interceptor.validator.lapsTotal', label: 'Intercepts',       color: '#4488ff' },
          { var: 'vehicles.target.validator.lapsTotal',      label: 'Target circuits',  color: '#ff4444' },
        ],
      },
      {
        label: 'Interceptor restarts',
        series: [
          { var: 'vehicles.interceptor.validator.restarts', label: 'Restarts', color: '#ff8800' },
        ],
      },
      {
        label: 'Mission phase',
        series: [
          { var: 'vehicles.interceptor.mission.phase', label: 'Interceptor phase', color: '#4488ff' },
          { var: 'vehicles.target.mission.phase',      label: 'Target phase',      color: '#ff4444' },
        ],
      },
      {
        label: 'Speed (m/s)',
        series: [
          {
            label: 'Interceptor',
            color: '#4488ff',
            fn: (s) => {
              const v = ((s.vehicles as ModelState).interceptor as ModelState).vel as ModelState;
              return Math.sqrt(((v.x as number) ?? 0) ** 2 + ((v.y as number) ?? 0) ** 2 + ((v.z as number) ?? 0) ** 2);
            },
          },
          {
            label: 'Target',
            color: '#ff4444',
            fn: (s) => {
              const v = ((s.vehicles as ModelState).target as ModelState).vel as ModelState;
              return Math.sqrt(((v.x as number) ?? 0) ** 2 + ((v.y as number) ?? 0) ** 2 + ((v.z as number) ?? 0) ** 2);
            },
          },
        ],
      },
      {
        label: 'Wind force (N)',
        series: [
          { var: 'wind.fx', label: 'wind fx', color: '#bbbbbb' },
          { var: 'wind.fz', label: 'wind fz', color: '#888888' },
        ],
      },
    ],
  };
}
