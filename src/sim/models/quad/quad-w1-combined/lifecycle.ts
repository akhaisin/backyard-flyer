// Combined-model lifecycle: one static block that publishes the shared K (scalar
// tunables + both tracks' routes) and runs the cross-track / restart validator
// for BOTH vehicles each tick, with a per-vehicle pass/fail verdict.
//
// This is the dual-vehicle analogue of lib/quad/lifecycle.ts. The per-vehicle
// validation math is identical to that block's after()/simTest, just applied to
// `state.vehicles.a` and `state.vehicles.b` instead of the top-level vehicle.
// Routes are injected into K by makeCombinedLifecycleBlock's mapStateOut (kept in
// route.ts as the single source of truth), and per-vehicle mission blocks read
// their own `steps` + `HOME_X/HOME_Z` via a K view in the config.

import type { BlockConfig, ModelState, HookFn } from '../../../engine/types';
import type { QuadConsts, StepDef } from '../../lib/quad/consts';

type Vec3 = { x: number; y: number; z: number };

const NAVIGATE = 2;
const RESTART  = 7;

function distPointToSegment(p: Vec3, a: Vec3, b: Vec3): number {
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

// Advance one vehicle's validator by a tick. Mirrors lib lifecycle.after +
// simTest: cross-track IAE over NAVIGATE, lap count (NAVIGATE→exit, excluding
// the RESTART retry), restart count (entries into PHASE_RESTART), and a live
// pass tally. `pass` is finalized in afterSim.
function stepValidator(veh: ModelState, K: ModelState, tick: number): ModelState {
  const v = veh.validator as ModelState;
  const mission = veh.mission as ModelState;
  const phase = Math.round(mission.phase as number);
  const prevPhase = Math.round(v.prevPhase as number);

  let lapsTotal = v.lapsTotal as number;
  if (prevPhase === NAVIGATE && phase !== NAVIGATE && phase !== RESTART) lapsTotal += 1;
  let restarts = v.restarts as number;
  if (prevPhase !== RESTART && phase === RESTART) restarts += 1;

  let completionTick = v.completionTick as number;
  let completionAccErr = v.completionAccErr as number;

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(veh.pos as Vec3, mission.segStart as Vec3, mission.segEnd as Vec3)
    : 0;
  const accErr = (v.accErr as number) + currentErr;
  if (completionTick < 0 && lapsTotal >= (K.REQUIRED_LAPS as number)) {
    completionTick = tick;
    completionAccErr = accErr;
  }

  const judgedTick = completionTick >= 0 ? completionTick : tick;
  const judgedAccErr = completionAccErr >= 0 ? completionAccErr : accErr;
  const checks = [
    lapsTotal >= (K.REQUIRED_LAPS as number),
    judgedTick <= (K.MAX_TICKS as number),
    judgedAccErr < (K.ACC_ERR_LIMIT as number),
  ];
  if ((K.MAX_RESTARTS as number) >= 0) checks.push(restarts <= (K.MAX_RESTARTS as number));

  return {
    prevPhase: phase, lapsTotal, restarts, completionTick, completionAccErr,
    currentErr, accErr,
    passCount: checks.filter(Boolean).length,
    passTotal: checks.length,
    pass: v.pass as number,
  };
}

export function before(state: ModelState): ModelState {
  return state;
}

export function after(state: ModelState): ModelState | false {
  const K = state.K as ModelState;
  const vehicles = state.vehicles as ModelState;
  const tick = state.tick as number;
  state.vehicles = {
    a: { ...(vehicles.a as ModelState), validator: stepValidator(vehicles.a as ModelState, K, tick) },
    b: { ...(vehicles.b as ModelState), validator: stepValidator(vehicles.b as ModelState, K, tick) },
  };
  if (tick >= (K.simDuration as number)) return false;
  return state;
}

export function afterSim(state: ModelState): ModelState {
  const K = state.K as ModelState;
  const tick = state.tick as number;
  const finalize = (veh: ModelState): ModelState => {
    const v = stepValidator(veh, K, tick);
    return { ...veh, validator: { ...v, pass: v.passCount === v.passTotal ? 1 : 0 } };
  };
  const vehicles = state.vehicles as ModelState;
  state.vehicles = { a: finalize(vehicles.a as ModelState), b: finalize(vehicles.b as ModelState) };
  return state;
}

const LIFECYCLE_CODE = `// combined lifecycle (read-only): publishes shared K and runs the per-vehicle
// cross-track + restart validator for vehicles.a and vehicles.b each tick, then
// finalizes a per-vehicle pass in afterSim. See quad-w1-combined/lifecycle.ts.`;

// Build the static lifecycle block. Scalars come from the shared defaults (+
// overrides); both tracks' routes are merged into K here so route.ts stays the
// single source of truth and the editable scalar producer stays route-free.
export function makeCombinedLifecycleBlock(
  defaults: QuadConsts,
  overrides: Partial<QuadConsts>,
  routeA: StepDef[],
  routeB: StepDef[],
): BlockConfig {
  const scalars: QuadConsts = { ...defaults, ...overrides };
  return {
    sourceId: 'lifecycle',
    exportName: 'beforeSim',
    defaultFn: () => ({ ...scalars }) as unknown as ModelState,
    defaultCode: LIFECYCLE_CODE,
    mapStateIn: () => ({}),
    mapStateOut: (out, s) => ({
      ...s,
      K: Object.freeze({ ...out, stepsA: routeA, stepsB: routeB }),
    }),
    static: true,
    staticKeys: ['K'],
    lifecycle: {
      before:   { exportName: 'before',   defaultFn: before   as HookFn },
      after:    { exportName: 'after',    defaultFn: after    as HookFn },
      afterSim: { exportName: 'afterSim', defaultFn: afterSim as HookFn },
    },
    tickFrequency: 1,
  };
}
