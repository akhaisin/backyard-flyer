// The `lifecycle` block — the sim's setup/teardown + per-tick hooks for the quad
// stack. Replaces the old `params` block and absorbs the cross-track validator.
//
// It exports four fns, all editable together in the source UI:
//   beforeSim()      → returns the (frozen) consts bag + route. Runs ONCE before
//                      the tick loop; its return becomes the engine static slice
//                      `K`. Includes `simDuration` (run length in ticks).
//   before(state)    → per-tick hook, runs BEFORE the block loop. No-op default.
//   after(state)     → per-tick hook, runs AFTER the block loop. Runs the
//                      cross-track validator (writing validator.* into the
//                      dynamic bus that charts read), then returns `false` once
//                      tick >= K.simDuration to stop the sim.
//   afterSim(state)  → runs once when the sim stops (any reason). No-op default.
//
// Like every editable block, this file's source is compiled with imports
// stripped — so the consts arrive as data and the validator math is inline.

import type { BlockConfig, LifecycleConfig, ModelState, HookFn } from '../../../engine/types';
import { compileSource } from '../../../engine/compile';
import type { QuadConsts, StepDef } from './consts';

// ── Source rendering (editable UI text + the default fns are compiled from it) ──

function fmt(v: number): string {
  if (v === Math.PI) return 'Math.PI';
  if (v === Math.PI / 2) return 'Math.PI / 2';
  return String(v);
}

// Render a step coordinate. Waypoints at cruise altitude render their y as the
// CRUISE_ALT const (declared at the top of beforeSim) rather than a literal, so
// the rectangle's altitude tracks that one knob.
function fmtCoord(v: number, cruiseAlt: number, isY: boolean): string {
  return isY && v === cruiseAlt ? 'CRUISE_ALT' : String(v);
}

function fmtStep(s: StepDef, cruiseAlt: number): string {
  const t = s.timeout !== undefined ? `, timeout: ${s.timeout}` : '';
  const x = fmtCoord(s.pos.x, cruiseAlt, false);
  const y = fmtCoord(s.pos.y, cruiseAlt, true);
  const z = fmtCoord(s.pos.z, cruiseAlt, false);
  return `      { pos: { x: ${x}, y: ${y}, z: ${z} }, threshold: ${s.threshold}${t} },`;
}

// The full editable lifecycle source. The default fns are compiled FROM this
// exact string (see makeLifecycleBlock), so there is a single source of truth —
// no drift between what the editor shows and what runs by default.
//
// CRUISE_ALT is emitted as a `const` before the return so both the constants bag
// and the steps can reference it (a sibling property in a single object literal
// can't, but a preceding const can).
export function renderLifecycleSource(values: QuadConsts, route: StepDef[]): string {
  const scalarLines = (Object.keys(values) as (keyof QuadConsts)[])
    .map(k => k === 'CRUISE_ALT' ? '    CRUISE_ALT,' : `    ${k}: ${fmt(values[k])},`)
    .join('\n');
  const stepLines = route.map(s => fmtStep(s, values.CRUISE_ALT)).join('\n');
  return `// lifecycle — sim setup/teardown + per-tick hooks for this model.
//
// beforeSim() returns the constants bag (state.K) and mission route. Edit a
// value and Stage to retune the whole model. after() runs the cross-track
// validator + simTest each tick and stops the sim at K.simDuration ticks.
// afterSim() finalizes the pass/fail verdict.

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

// Success criteria. Returns { passed, total } — how many checks pass out of how
// many. Edit thresholds in beforeSim's K; edit the checks themselves here (the
// denominator follows automatically).
function simTest(state) {
  const v = state.validator, K = state.K;
  const checks = [
    v.lapsTotal >= K.REQUIRED_LAPS,   // completed enough laps
    state.tick <= K.MAX_TICKS,        // finished within the tick budget
    v.accErr < K.ACC_ERR_LIMIT,       // accumulated cross-track error (IAE)
  ];
  return { passed: checks.filter(Boolean).length, total: checks.length };
}

export function beforeSim() {
  const CRUISE_ALT = ${fmt(values.CRUISE_ALT)};
  return {
${scalarLines}
    steps: [
${stepLines}
    ],
  };
}

export function before(state) {
  return state;
}

export function after(state) {
  // Mission contract: mission.phase === 2 is the NAVIGATE phase. Declared here
  // (not imported) because edited block source is compiled with imports stripped.
  const NAVIGATE = 2;

  // ── Cross-track validator ──
  // currentErr: instantaneous distance from the active mission segment.
  // accErr:     running sum of currentErr over every NAVIGATE tick (IAE).
  // lapsTotal:  incremented each time we leave NAVIGATE (one mission lap).
  const v = state.validator;
  const phase = Math.round(state.mission.phase);
  const prevPhase = Math.round(v.prevPhase);

  let lapsTotal = v.lapsTotal;
  if (prevPhase === NAVIGATE && phase !== NAVIGATE) lapsTotal += 1;

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(state.pos, state.mission.segStart, state.mission.segEnd)
    : 0;

  const accErr = v.accErr + currentErr;

  state.validator = {
    prevPhase: phase, lapsTotal, currentErr, accErr,
    passCount: v.passCount, passTotal: v.passTotal, pass: v.pass,
  };

  // Live count of how many checks currently pass (shown as X/N in the overlay).
  const t = simTest(state);
  state.validator.passCount = t.passed;
  state.validator.passTotal = t.total;

  // ── Stop conditions ──
  // Early stop the moment the required laps are done, so the final tick reflects
  // HOW LONG that took — that is what the duration check (tick <= MAX_TICKS)
  // judges. simDuration is the hard cap that bounds a run that never finishes.
  if (lapsTotal >= state.K.REQUIRED_LAPS) return false;
  if (state.tick >= state.K.simDuration) return false;
  return state;
}

export function afterSim(state) {
  // Finalize the verdict: pass only if every check passed. pass: 1 = pass,
  // 0 = fail, -1 = still running (set in initialState / on reset).
  const t = simTest(state);
  state.validator.passCount = t.passed;
  state.validator.passTotal = t.total;
  state.validator.pass = t.passed === t.total ? 1 : 0;
  return state;
}
`;
}

// ── BlockConfig builder ──

const EXPORTS = ['beforeSim', 'before', 'after', 'afterSim'];

// Build the lifecycle BlockConfig. `defaults` are the shared scalars, `route`
// the model's waypoints, `overrides` patch scalars per instance. The default
// fns are compiled from the rendered source so source and behavior never drift.
export function makeLifecycleBlock(
  defaults: QuadConsts,
  route: StepDef[],
  overrides?: Partial<QuadConsts>,
): BlockConfig {
  const scalars: QuadConsts = { ...defaults, ...overrides };
  const source = renderLifecycleSource(scalars, route);
  const { fns, error } = compileSource(source, EXPORTS);
  if (error || !fns.beforeSim || !fns.before || !fns.after || !fns.afterSim) {
    throw new Error(`lifecycle source failed to compile: ${error ?? 'missing export'}`);
  }

  const lifecycle: LifecycleConfig = {
    before:   { exportName: 'before',   defaultFn: fns.before   as HookFn },
    after:    { exportName: 'after',    defaultFn: fns.after    as HookFn },
    afterSim: { exportName: 'afterSim', defaultFn: fns.afterSim as HookFn },
  };

  return {
    sourceId: 'lifecycle',
    exportName: 'beforeSim',
    // beforeSim is the static producer: its return becomes the frozen K slice.
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
