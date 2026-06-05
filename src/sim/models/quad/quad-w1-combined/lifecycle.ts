// Combined-model lifecycle: one static block that publishes the shared K (scalar
// tunables + both tracks' routes) and runs the cross-track / restart validator
// for BOTH vehicles each tick, with a per-vehicle pass/fail verdict.
//
// Mirrors lib/quad/lifecycle.ts in structure: renderCombinedLifecycleSource
// produces editable source (with stepsA + stepsB in beforeSim), compileSource
// turns it into the defaultFns, so source and behavior never drift.

import type { BlockConfig, LifecycleConfig, ModelState, HookFn } from '../../../engine/types';
import { compileSource } from '../../../engine/compile';
import { fmt, fmtStep } from '../../lib/quad/lifecycle';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';

const EXPORTS = ['beforeSim', 'before', 'after', 'afterSim'];

export function renderCombinedLifecycleSource(
  values: QuadConsts,
  routeA: StepDef[],
  routeB: StepDef[],
): string {
  const scalarLines = (Object.keys(values) as (keyof QuadConsts)[])
    .map(k => k === 'CRUISE_ALT' ? '    CRUISE_ALT,' : `    ${k}: ${fmt(values[k])},`)
    .join('\n');
  const stepLinesA = routeA.map(s => fmtStep(s, values.CRUISE_ALT)).join('\n');
  const stepLinesB = routeB.map(s => fmtStep(s, values.CRUISE_ALT)).join('\n');
  return `// combined lifecycle — sim setup/teardown + per-tick hooks for both vehicles.
//
// beforeSim() returns the shared constants bag (state.K) plus both mission
// routes. after() runs the cross-track validator for vehicles.a and vehicles.b
// each tick and stops at K.simDuration. afterSim() finalizes per-vehicle pass.

export function beforeSim() {
  const CRUISE_ALT = ${fmt(values.CRUISE_ALT)};
  return {
${scalarLines}
    stepsA: [
${stepLinesA}
    ],
    stepsB: [
${stepLinesB}
    ],
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

// Advance one vehicle's validator by a tick. Returns updated validator state.
// cross-track IAE over NAVIGATE, lap count (NAVIGATE→exit, excluding RESTART
// retry), restart count (entries into PHASE_RESTART), live pass tally.
function stepValidator(veh, K, tick) {
  const NAVIGATE = 2, RESTART = 7;
  const v = veh.validator;
  const mission = veh.mission;
  const phase = Math.round(mission.phase);
  const prevPhase = Math.round(v.prevPhase);

  let lapsTotal = v.lapsTotal;
  if (prevPhase === NAVIGATE && phase !== NAVIGATE && phase !== RESTART) lapsTotal += 1;
  let restarts = v.restarts;
  if (prevPhase !== RESTART && phase === RESTART) restarts += 1;

  let completionTick = v.completionTick;
  let completionAccErr = v.completionAccErr;

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(veh.pos, mission.segStart, mission.segEnd)
    : 0;
  const accErr = v.accErr + currentErr;
  if (completionTick < 0 && lapsTotal >= K.REQUIRED_LAPS) {
    completionTick = tick;
    completionAccErr = accErr;
  }

  const judgedTick = completionTick >= 0 ? completionTick : tick;
  const judgedAccErr = completionAccErr >= 0 ? completionAccErr : accErr;
  const checks = [
    lapsTotal >= K.REQUIRED_LAPS,
    judgedTick <= K.MAX_TICKS,
    judgedAccErr < K.ACC_ERR_LIMIT,
  ];
  if (K.MAX_RESTARTS >= 0) checks.push(restarts <= K.MAX_RESTARTS);

  return {
    prevPhase: phase, lapsTotal, restarts, completionTick, completionAccErr,
    currentErr, accErr,
    passCount: checks.filter(Boolean).length,
    passTotal: checks.length,
    pass: v.pass,
  };
}

export function before(state) {
  return state;
}

export function after(state) {
  const K = state.K;
  const tick = state.tick;
  state.vehicles = {
    a: { ...state.vehicles.a, validator: stepValidator(state.vehicles.a, K, tick) },
    b: { ...state.vehicles.b, validator: stepValidator(state.vehicles.b, K, tick) },
  };
  if (tick >= K.simDuration) return false;
  return state;
}

export function afterSim(state) {
  const K = state.K;
  const tick = state.tick;
  const finalize = (veh) => {
    const v = stepValidator(veh, K, tick);
    return { ...veh, validator: { ...v, pass: v.passCount === v.passTotal ? 1 : 0 } };
  };
  state.vehicles = { a: finalize(state.vehicles.a), b: finalize(state.vehicles.b) };
  return state;
}
`;
}

// Build the combined lifecycle BlockConfig. Scalars come from defaults +
// overrides; both routes are rendered into beforeSim so the user can edit them
// in the source UI, exactly like the single-vehicle lifecycle.
export function makeCombinedLifecycleBlock(
  defaults: QuadConsts,
  overrides: Partial<QuadConsts>,
  routeA: StepDef[],
  routeB: StepDef[],
): BlockConfig {
  const scalars: QuadConsts = { ...defaults, ...overrides };
  const source = renderCombinedLifecycleSource(scalars, routeA, routeB);
  const { fns, error } = compileSource(source, EXPORTS);
  if (error || !fns.beforeSim || !fns.before || !fns.after || !fns.afterSim) {
    throw new Error(`combined lifecycle source failed to compile: ${error ?? 'missing export'}`);
  }

  const lifecycle: LifecycleConfig = {
    before:   { exportName: 'before',   defaultFn: fns.before   as HookFn },
    after:    { exportName: 'after',    defaultFn: fns.after    as HookFn },
    afterSim: { exportName: 'afterSim', defaultFn: fns.afterSim as HookFn },
  };

  return {
    sourceId: 'lifecycle',
    exportName: 'beforeSim',
    defaultFn: () => fns.beforeSim!({}) as ModelState,
    defaultCode: source,
    mapStateIn: () => ({}),
    mapStateOut: (out, s) => ({ ...s, K: Object.freeze(out) }),
    static: true,
    staticKeys: ['K'],
    lifecycle,
    tickFrequency: 1,
  };
}
