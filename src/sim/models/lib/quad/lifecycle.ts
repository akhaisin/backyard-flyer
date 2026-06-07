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
import { STEP_TYPE_WP, STEP_TYPE_W1A, STEP_TYPE_W1B, STEP_TYPE_RATES, STEP_TYPE_CTURN, STEP_TYPE_C1A } from './consts';
import type { QuadConsts, StepDef, CTurnStep, C1aStep } from './consts';

// ── Source rendering (editable UI text + the default fns are compiled from it) ──

export function fmt(v: number): string {
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

function fmtVec(v: { x: number; y: number; z: number }): string {
  return `{ x: ${v.x}, y: ${v.y}, z: ${v.z} }`;
}

function fmtRange(r: { start: number; end: number }): string {
  return `{ start: ${r.start}, end: ${r.end} }`;
}

export function fmtStep(s: StepDef, cruiseAlt: number): string {
  const x = fmtCoord(s.pos.x, cruiseAlt, false);
  const y = fmtCoord(s.pos.y, cruiseAlt, true);
  const z = fmtCoord(s.pos.z, cruiseAlt, false);
  const parts = [`type: ${s.type}`, `pos: { x: ${x}, y: ${y}, z: ${z} }`];
  switch (s.type) {
    case STEP_TYPE_WP:
      parts.push(`threshold: ${s.threshold}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    case STEP_TYPE_W1A:
      parts.push(`normal: ${fmtVec(s.normal)}`);
      parts.push(`width: ${s.width}`);
      parts.push(`height: ${s.height}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    case STEP_TYPE_W1B:
      parts.push(`normal: ${fmtVec(s.normal)}`);
      parts.push(`width: ${s.width}`);
      parts.push(`height: ${s.height}`);
      parts.push(`preStageDist: ${s.preStageDist}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    case STEP_TYPE_RATES:
      parts.push(`duration: ${s.duration}`);
      parts.push(`throttle: ${fmtRange(s.throttle)}`);
      parts.push(`yaw: ${fmtRange(s.yaw)}`);
      parts.push(`pitch: ${fmtRange(s.pitch)}`);
      parts.push(`roll: ${fmtRange(s.roll)}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    case STEP_TYPE_CTURN: {
      const cs = s as CTurnStep;
      const wps = cs.waypoints.map(w => `{ x: ${w.x}, y: ${fmtCoord(w.y, cruiseAlt, true)}, z: ${w.z} }`).join(', ');
      parts.push(`waypoints: [${wps}]`);
      parts.push(`durationTicks: ${cs.durationTicks}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    }
    case STEP_TYPE_C1A: {
      const cs = s as C1aStep;
      const dx = fmtCoord(cs.dest.x, cruiseAlt, false);
      const dy = fmtCoord(cs.dest.y, cruiseAlt, true);
      const dz = fmtCoord(cs.dest.z, cruiseAlt, false);
      parts.push(`dest: { x: ${dx}, y: ${dy}, z: ${dz} }`);
      parts.push(`speed: ${cs.speed}`);
      parts.push(`threshold: ${cs.threshold}`);
      if (cs.preStageDist !== undefined) parts.push(`preStageDist: ${cs.preStageDist}`);
      if (s.timeout !== undefined) parts.push(`timeout: ${s.timeout}`);
      break;
    }
  }
  return `      { ${parts.join(', ')} },`;
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

export function beforeSim() {
  const CRUISE_ALT = ${fmt(values.CRUISE_ALT)};
  return {
${scalarLines}
    steps: [
${stepLines}
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

// Success criteria. Returns { passed, total } — how many checks pass out of how
// many. Edit thresholds in beforeSim's K; edit the checks themselves here (the
// denominator follows automatically).
function simTest(state) {
  const v = state.validator, K = state.K;
  const judgedTick = v.completionTick >= 0 ? v.completionTick : state.tick;
  const judgedAccErr = v.completionAccErr >= 0 ? v.completionAccErr : v.accErr;
  const checks = [
    v.lapsTotal >= K.REQUIRED_LAPS,   // completed enough laps
    judgedTick <= K.MAX_TICKS,        // finished within the tick budget
    judgedAccErr < K.ACC_ERR_LIMIT,   // accumulated cross-track error (IAE)
  ];
  // A pass-criterion knob set to -1 means "not applicable" — the check is dropped
  // and the denominator shrinks. Waypoint courses have no gates to miss, so they
  // leave MAX_RESTARTS at -1; window models set a real budget to opt in.
  if (K.MAX_RESTARTS >= 0) checks.push(v.restarts <= K.MAX_RESTARTS);
  return { passed: checks.filter(Boolean).length, total: checks.length };
}

export function before(state) {
  return state;
}

export function after(state) {
  // Mission contract: mission.phase 2 = NAVIGATE, 7 = RESTART (fly back to a
  // missed gate's anchor). Declared here (not imported) because edited block
  // source is compiled with imports stripped.
  const NAVIGATE = 2;
  const RESTART  = 7;

  // ── Cross-track validator ──
  // currentErr: instantaneous distance from the active mission segment.
  // accErr:     running sum of currentErr over every NAVIGATE tick (IAE).
  // lapsTotal:  incremented when we leave NAVIGATE to finish a lap (NAVIGATE →
  //             RESTART is a missed-gate retry, not a lap, so it is excluded).
  // restarts:   incremented each time mission enters PHASE_RESTART.
  const v = state.validator;
  const phase = Math.round(state.mission.phase);
  const prevPhase = Math.round(v.prevPhase);

  let lapsTotal = v.lapsTotal;
  if (prevPhase === NAVIGATE && phase !== NAVIGATE && phase !== RESTART) lapsTotal += 1;
  let restarts = v.restarts;
  if (prevPhase !== RESTART && phase === RESTART) restarts += 1;
  let completionTick = v.completionTick;
  let completionAccErr = v.completionAccErr;

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(state.pos, state.mission.segStart, state.mission.segEnd)
    : 0;

  const accErr = v.accErr + currentErr;
  if (completionTick < 0 && lapsTotal >= state.K.REQUIRED_LAPS) {
    completionTick = state.tick;
    completionAccErr = accErr;
  }

  state.validator = {
    prevPhase: phase, lapsTotal, restarts, completionTick, completionAccErr, currentErr, accErr,
    passCount: v.passCount, passTotal: v.passTotal, pass: v.pass,
  };

  // Live count of how many checks currently pass (shown as X/N in the overlay).
  const t = simTest(state);
  state.validator.passCount = t.passed;
  state.validator.passTotal = t.total;

  // ── Stop conditions ──
  // Let the simulation keep running after the lap target is reached so the run
  // ends naturally. simDuration remains the hard cap that bounds a run that
  // never settles or never stops on its own.
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
