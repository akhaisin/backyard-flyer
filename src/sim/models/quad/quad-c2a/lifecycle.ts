// Combined lifecycle for quad-c2a — two vehicles, separate routes, separate consts.
//
// beforeSim() publishes:
//   • shared scalars: sim lifecycle, validator criteria, wind constants
//   • stepsTarget / stepsInterceptor: raw route arrays (for vis and lifecycle access)
//   • state.K.target:      full QuadParams for the target vehicle (HOME, steps, physics/gains)
//   • state.K.interceptor: full QuadParams for the interceptor vehicle
//
// Block mapStateIn functions pass K.target or K.interceptor to each vehicle's blocks
// rather than the flat s.K used by single-vehicle models. Students editing either
// vehicle's source blocks see the correct per-vehicle values.
//
// after() runs the cross-track / restart validator for BOTH vehicles each tick:
//   • interceptor: lapsTotal = intercepts landed; restarts = target-escaped rounds
//   • target:      lapsTotal = circuits completed (display only)
// afterSim() finalises the interceptor's pass/fail verdict.

import type { BlockConfig, LifecycleConfig, ModelState, HookFn } from '../../../engine/types';
import { compileSource } from '../../../engine/compile';
import { fmt, fmtStep } from '../../lib/quad/lifecycle';
import { STEP_TYPE_WP, STEP_TYPE_C2A } from '../../lib/quad/consts';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';

const EXPORTS = ['beforeSim', 'before', 'after', 'afterSim'];

// Keys that live at top-level K (shared between vehicles).
// Wind block and lifecycle after() read these directly from state.K.
const SHARED_CONSTS_KEYS: ReadonlyArray<keyof QuadConsts> = [
  'simDuration', 'MAX_TICKS', 'REQUIRED_LAPS', 'ACC_ERR_LIMIT', 'MAX_RESTARTS',
  'WIND_FORCE_INITIAL_PCT', 'WIND_FORCE_MAX_PCT', 'WIND_MAX_N',
  'WIND_DURATION_MIN_TICKS', 'WIND_DURATION_MAX_TICKS',
];

// Keys handled specially (local var or placed explicitly at end of vehicle block).
const SKIP_IN_VEHICLE: ReadonlyArray<keyof QuadConsts> = [
  ...SHARED_CONSTS_KEYS, 'CRUISE_ALT', 'HOME_X', 'HOME_Z',
];

function renderVehicleBlock(values: QuadConsts, stepsVar: string): string {
  const indent = '      ';
  const lines: string[] = (Object.keys(values) as (keyof QuadConsts)[])
    .filter(k => !(SKIP_IN_VEHICLE as string[]).includes(k))
    .map(k => `${indent}${k}: ${fmt(values[k])},`);
  // HOME_X/Z and CRUISE_ALT go last for clarity
  lines.push(`${indent}HOME_X: ${fmt(values.HOME_X)},`);
  lines.push(`${indent}HOME_Z: ${fmt(values.HOME_Z)},`);
  lines.push(`${indent}CRUISE_ALT,`);
  lines.push(`${indent}steps: ${stepsVar},`);
  return lines.join('\n');
}

export function renderC2aLifecycleSource(
  interceptorConsts: QuadConsts,
  targetConsts: QuadConsts,
  targetRoute: StepDef[],
  interceptorStep: StepDef,
): string {
  const cruiseAlt = interceptorConsts.CRUISE_ALT;

  const sharedLines = SHARED_CONSTS_KEYS
    .map(k => `    ${k}: ${fmt(interceptorConsts[k])},`)
    .join('\n');

  const targetBlockLines      = renderVehicleBlock(targetConsts,      'stepsTarget');
  const interceptorBlockLines = renderVehicleBlock(interceptorConsts, 'stepsInterceptor');

  const targetStepLines      = targetRoute.map(s => fmtStep(s, cruiseAlt)).join('\n');
  const interceptorStepLines = fmtStep(interceptorStep, cruiseAlt);

  return `// c2a combined lifecycle — sim setup/teardown + per-tick hooks for both vehicles.
//
// beforeSim() returns two per-vehicle constant bags (state.K.target and
// state.K.interceptor) plus shared scalars at the top level. Editing values
// in either vehicle block changes only that vehicle's physics and gains.
//
// stepsTarget / stepsInterceptor are declared as local variables so both the
// top-level slots and the per-vehicle steps: fields reference the same arrays.

export function beforeSim() {
  const CRUISE_ALT = ${fmt(cruiseAlt)};
  const stepsTarget = [
${targetStepLines}
  ];
  const stepsInterceptor = [
${interceptorStepLines}
  ];
  return {
    // ── shared: sim lifecycle, validator criteria, wind ──
${sharedLines}
    stepsTarget,
    stepsInterceptor,
    // ── per-vehicle: physics, gains, noise, mission ──
    target: {
${targetBlockLines}
    },
    interceptor: {
${interceptorBlockLines}
    },
  };
}

function distPointToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  const t = ab2 > 0
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2))
    : 0;
  const cx = a.x + t * abx, cy = a.y + t * aby, cz = a.z + t * abz;
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Advance one vehicle's validator by one tick. Returns updated validator state.
//
// Counting rules (c2a dual-vehicle):
//   lapsTotal — increments on successful intercept (interceptor, planner.stepStatus=1) or
//               natural WP circuit completion (target, planner_wp.stepStatus=1)
//   restarts  — increments on failed intercept (interceptor, planner.stepStatus=2, i.e. STATUS_FAILED)
//
// A forceRTH mid-circuit transition (NAVIGATE→RTH with neither planner reporting completion)
// increments neither counter — the target was cut short, not a counted event.
function stepValidator(veh, K, tick) {
  const NAVIGATE = 2, RTH = 3, RESTART = 7;
  const STATUS_COMPLETED = 1, STATUS_FAILED = 2;
  const v = veh.validator;
  const phase     = Math.round(veh.mission.phase);
  const prevPhase = Math.round(v.prevPhase);

  let lapsTotal = v.lapsTotal;
  let restarts  = v.restarts;

  // planner_c2a and planner_wp run AFTER mission in the same tick, so on the
  // NAVIGATE→RTH transition tick both planners have already reset stepStatus
  // to STATUS_RUNNING (they see phase=RTH, not NAVIGATE). Capture the statuses
  // one tick earlier while phase is still NAVIGATE, then use them on the
  // transition tick via v.capturedC2aStatus / v.capturedWpStatus.
  const capC2a = phase === NAVIGATE
    ? Math.round(veh.planner?.stepStatus    ?? -1)
    : Math.round(v.capturedC2aStatus ?? -1);
  const capWp  = phase === NAVIGATE
    ? Math.round(veh.planner_wp?.stepStatus ?? -1)
    : Math.round(v.capturedWpStatus  ?? -1);

  if (prevPhase === NAVIGATE && phase !== NAVIGATE && phase !== RESTART) {
    if (capC2a === STATUS_FAILED) {
      restarts += 1;
    } else if (capC2a === STATUS_COMPLETED || capWp === STATUS_COMPLETED) {
      lapsTotal += 1;
    }
    // forceRTH mid-circuit (neither status): no counter change
  }
  if (prevPhase !== RESTART && phase === RESTART) restarts += 1;

  let completionTick = v.completionTick;
  let completionAccErr = v.completionAccErr;

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(veh.pos, veh.mission.segStart, veh.mission.segEnd)
    : 0;
  const accErr = v.accErr + currentErr;

  if (completionTick < 0 && lapsTotal >= K.REQUIRED_LAPS) {
    completionTick = tick;
    completionAccErr = accErr;
  }

  const judgedTick   = completionTick >= 0 ? completionTick : tick;
  const judgedAccErr = completionAccErr >= 0 ? completionAccErr : accErr;
  const checks = [
    lapsTotal >= K.REQUIRED_LAPS,
    judgedTick <= K.MAX_TICKS,
  ];
  if (K.MAX_RESTARTS >= 0) checks.push(restarts <= K.MAX_RESTARTS);

  return {
    prevPhase: phase, lapsTotal, restarts, completionTick, completionAccErr,
    currentErr, accErr,
    capturedC2aStatus: capC2a,
    capturedWpStatus:  capWp,
    passCount: checks.filter(Boolean).length,
    passTotal: checks.length,
    pass: v.pass,
  };
}

export function before(state) {
  return state;
}

export function after(state) {
  const K    = state.K;
  const tick = state.tick;
  state.vehicles = {
    target:      { ...state.vehicles.target,      validator: stepValidator(state.vehicles.target,      K, tick) },
    interceptor: { ...state.vehicles.interceptor, validator: stepValidator(state.vehicles.interceptor, K, tick) },
  };
  if (tick >= K.simDuration) return false;
  return state;
}

export function afterSim(state) {
  const K    = state.K;
  const tick = state.tick;
  const finalize = (veh) => {
    const v = stepValidator(veh, K, tick);
    return { ...veh, validator: { ...v, pass: v.passCount === v.passTotal ? 1 : 0 } };
  };
  state.vehicles = {
    target:      state.vehicles.target,
    interceptor: finalize(state.vehicles.interceptor),
  };
  return state;
}
`;
}

export function makeC2aLifecycleBlock(
  interceptorConsts: QuadConsts,
  targetConsts: QuadConsts,
  targetRoute: StepDef[],
  interceptorStep: StepDef,
): BlockConfig {
  const source = renderC2aLifecycleSource(interceptorConsts, targetConsts, targetRoute, interceptorStep);
  const { fns, error } = compileSource(source, EXPORTS);
  if (error || !fns.beforeSim || !fns.before || !fns.after || !fns.afterSim) {
    throw new Error(`c2a lifecycle source failed to compile: ${error ?? 'missing export'}`);
  }

  const lifecycle: LifecycleConfig = {
    before:   { exportName: 'before',   defaultFn: fns.before   as HookFn },
    after:    { exportName: 'after',    defaultFn: fns.after    as HookFn },
    afterSim: { exportName: 'afterSim', defaultFn: fns.afterSim as HookFn },
  };

  return {
    sourceId:   'lifecycle',
    exportName: 'beforeSim',
    defaultFn:  () => fns.beforeSim!({}) as ModelState,
    defaultCode: source,
    mapStateIn:  () => ({}),
    mapStateOut: (out, s) => ({ ...s, K: Object.freeze(out) }),
    static:     true,
    staticKeys: ['K'],
    lifecycle,
    tickFrequency: 1,
  };
}
