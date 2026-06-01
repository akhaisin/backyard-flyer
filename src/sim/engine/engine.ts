import { compileSource } from './compile';
import { setPath } from './types';
import type { BlockConfig, ModelConfig, ModelState, BlockFn, HookFn, LifecycleHook } from './types';

const LS_PREFIX = 'backyard-flyer.sims';
const LS_VERSION = 'v1';

function lsKey(simId: string, sourceId: string): string {
  return `${LS_PREFIX}.${simId}.${LS_VERSION}.sources.${sourceId}`;
}

type StateListener = (state: ModelState, tick: number) => void;
type RunningListener = (running: boolean) => void;
type ErrorListener = (error: Error | null) => void;
type InputsListener = (inputs: ModelState) => void;

interface SimInstance {
  config: ModelConfig;
  state: ModelState;
  history: ModelState[];
  // Static slice: built once by `static` blocks, merged into each tick's block
  // input but never written into `state`/`history` (so consts aren't duplicated
  // per tick). Read live via getStatic(); passed explicitly to charts/vis.
  staticState: ModelState;
  staticKeys: string[];
  tick: number;
  activeFns: Record<string, BlockFn>;
  pendingFns: Record<string, BlockFn>;
  hasPending: boolean;
  running: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  error: Error | null;
  liveInputs: ModelState;
  defaultInputs: ModelState;
  stateListeners: Set<StateListener>;
  runningListeners: Set<RunningListener>;
  errorListeners: Set<ErrorListener>;
  inputsListeners: Set<InputsListener>;
}

function buildDefaultInputs(blocks: BlockConfig[]): ModelState {
  const inputs: ModelState = {};
  for (const block of blocks) {
    if (!block.inputs) continue;
    inputs[block.sourceId] = structuredClone(block.inputs);
  }
  return inputs;
}

const instances: Record<string, SimInstance> = {};

// Run every `static` block once and collect its declared keys into one slice.
// Static blocks take no tick input (mapStateIn over an empty state) and run in
// config order, so a later static block can read an earlier one's keys.
function computeStaticState(blocks: BlockConfig[], fns: Record<string, BlockFn>): {
  staticState: ModelState;
  staticKeys: string[];
} {
  let staticState: ModelState = {};
  const staticKeys: string[] = [];
  for (const block of blocks) {
    if (!block.static) continue;
    const localIn = block.mapStateIn(staticState);
    const localOut = fns[block.sourceId](localIn);
    staticState = block.mapStateOut(localOut, staticState);
    for (const k of block.staticKeys ?? []) {
      if (!staticKeys.includes(k)) staticKeys.push(k);
    }
  }
  return { staticState, staticKeys };
}

function compileBlock(code: string, exportName: string): { fn: BlockFn | null; error: string | null } {
  const { fns, error } = compileSource(code, [exportName]);
  if (error) return { fn: null, error };
  const fn = fns[exportName];
  if (typeof fn !== 'function') {
    return { fn: null, error: `Export "${exportName}" not found — check the function name` };
  }
  return { fn: fn as BlockFn, error: null };
}

// Lifecycle hooks live in `activeFns` under synthetic keys so staging/revert and
// recompilation reuse the same machinery as ordinary block fns.
const HOOK_KEY = (sourceId: string, exportName: string) => `${sourceId}::${exportName}`;

function lifecycleHooks(block: BlockConfig): LifecycleHook[] {
  const lc = block.lifecycle;
  if (!lc) return [];
  return [lc.before, lc.after, lc.afterSim].filter((h): h is LifecycleHook => !!h);
}

// Seed each block's hook fns into activeFns: recompile from the block's stored
// (edited) source if present, else use the hook's compiled-from-source default.
function seedHookFns(simId: string, block: BlockConfig, activeFns: Record<string, BlockFn>): void {
  const hooks = lifecycleHooks(block);
  if (hooks.length === 0) return;
  const stored = localStorage.getItem(lsKey(simId, block.sourceId));
  const names = hooks.map(h => h.exportName);
  const compiled = stored ? compileSource(stored, names).fns : {};
  for (const h of hooks) {
    const fn = compiled[h.exportName] ?? (h.defaultFn as BlockFn);
    activeFns[HOOK_KEY(block.sourceId, h.exportName)] = fn;
  }
}

export function initSim(simId: string, config: ModelConfig): void {
  if (instances[simId]) return;

  const activeFns: Record<string, BlockFn> = {};
  for (const block of config.blocks) {
    const stored = localStorage.getItem(lsKey(simId, block.sourceId));
    if (stored) {
      const { fn } = compileBlock(stored, block.exportName);
      activeFns[block.sourceId] = fn ?? block.defaultFn;
    } else {
      activeFns[block.sourceId] = block.defaultFn;
    }
    seedHookFns(simId, block, activeFns);
  }

  const defaultInputs = buildDefaultInputs(config.blocks);
  const liveInputs = structuredClone(defaultInputs);
  const { staticState, staticKeys } = computeStaticState(config.blocks, activeFns);
  const state = structuredClone(config.initialState);
  state.inputs = structuredClone(liveInputs);

  instances[simId] = {
    config,
    state,
    history: [],
    staticState,
    staticKeys,
    tick: 0,
    activeFns,
    pendingFns: {},
    hasPending: false,
    running: false,
    intervalId: null,
    error: null,
    liveInputs,
    defaultInputs,
    stateListeners: new Set(),
    runningListeners: new Set(),
    errorListeners: new Set(),
    inputsListeners: new Set(),
  };
}

function getInstance(simId: string): SimInstance {
  const inst = instances[simId];
  if (!inst) throw new Error(`Sim "${simId}" not initialized — call initSim first`);
  return inst;
}

// Run the `before`/`after` lifecycle hooks of every lifecycle block in config
// order. Each hook sees the dynamic state with the static slice and `tick`
// merged in; the injected keys are stripped from its result so they never enter
// persisted state. A hook returning `false` aborts the tick (caller stops the
// sim). Throws propagate to the caller's error handling.
function runLifecycle(inst: SimInstance, phase: 'before' | 'after', state: ModelState): ModelState | false {
  for (const block of inst.config.blocks) {
    const hook = block.lifecycle?.[phase];
    if (!hook) continue;
    const fn = inst.activeFns[HOOK_KEY(block.sourceId, hook.exportName)] as HookFn;
    const out = fn({ ...state, ...inst.staticState, tick: inst.tick });
    if (out === false) return false;
    for (const k of inst.staticKeys) delete out[k];
    delete out.tick;
    state = out;
  }
  return state;
}

// Fire every lifecycle block's `afterSim` hook once. Unlike per-tick hooks,
// afterSim's returned state IS committed (and listeners notified) so a teardown
// hook can finalize a verdict (e.g. validator.pass). Injected static keys +
// `tick` are stripped before persisting, mirroring runLifecycle. Errors are
// logged, not thrown — teardown must not mask the stop reason. afterSim runs
// after the last committed tick, so it doesn't push a new history entry; it
// updates the live state only.
function runAfterSim(inst: SimInstance): void {
  for (const block of inst.config.blocks) {
    const hook = block.lifecycle?.afterSim;
    if (!hook) continue;
    const fn = inst.activeFns[HOOK_KEY(block.sourceId, hook.exportName)] as HookFn;
    try {
      const out = fn({ ...inst.state, ...inst.staticState, tick: inst.tick });
      if (out === false) continue;
      for (const k of inst.staticKeys) delete out[k];
      delete out.tick;
      inst.state = out;
      inst.stateListeners.forEach(cb => cb(out, inst.tick));
    } catch (e) {
      console.error(`[sim:${inst.config.modelId}] afterSim error:`, e);
    }
  }
}

function doTick(simId: string): void {
  const inst = getInstance(simId);
  // Snapshot live inputs into state at start of tick — every block in this tick
  // sees the same input values, and the per-tick history entry will carry them.
  // Relies on each block's mapStateOut preserving unrelated state keys.
  let state: ModelState = { ...inst.state, inputs: structuredClone(inst.liveInputs) };

  try {
    const beforeOut = runLifecycle(inst, 'before', state);
    if (beforeOut === false) { stopSim(simId); return; }
    state = beforeOut;

    for (const block of inst.config.blocks) {
      if (block.static) continue;  // static blocks ran once before the loop
      if (inst.tick % block.tickFrequency !== 0) continue;
      // Static slice is merged into the block's view (so state.K.* resolves) but
      // never written back into `state` — it stays out of history. Static spreads
      // last so its keys are authoritative and can't be shadowed by a dynamic
      // placeholder. mapStateOut receives the dynamic `state`, so static never
      // leaks into the persisted snapshot.
      const localIn = block.mapStateIn({ ...state, ...inst.staticState });
      const localOut = inst.activeFns[block.sourceId](localIn);
      state = block.mapStateOut(localOut, state);
    }

    // `after` runs the validator etc. and gates the run length: returning false
    // (tick >= simDuration) discards THIS tick and stops, so exactly simDuration
    // ticks are committed and validator data is present on every committed tick.
    const afterOut = runLifecycle(inst, 'after', state);
    if (afterOut === false) { stopSim(simId); return; }
    state = afterOut;
  } catch (e) {
    stopSim(simId);
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`[sim:${simId}] Runtime error during tick:`, e);
    inst.error = error;
    inst.errorListeners.forEach(cb => cb(error));
    return;
  }

  inst.state = state;
  inst.tick++;
  inst.history.push(structuredClone(state));
  inst.stateListeners.forEach(cb => cb(state, inst.tick));
}

export function startSim(simId: string): void {
  const inst = getInstance(simId);
  if (inst.running) return;

  if (inst.hasPending) {
    Object.assign(inst.activeFns, inst.pendingFns);
    inst.pendingFns = {};
    inst.hasPending = false;
    // Staged code may include an edited static block — recompute the slice so
    // retuned consts take effect on the fresh run.
    const recomputed = computeStaticState(inst.config.blocks, inst.activeFns);
    inst.staticState = recomputed.staticState;
    inst.staticKeys = recomputed.staticKeys;
    const freshState = structuredClone(inst.config.initialState);
    freshState.inputs = structuredClone(inst.liveInputs);
    inst.state = freshState;
    inst.history = [];
    inst.tick = 0;
    inst.error = null;
    inst.errorListeners.forEach(cb => cb(null));
  }

  inst.running = true;
  inst.intervalId = setInterval(() => doTick(simId), inst.config.tickIntervalMs);
  inst.runningListeners.forEach(cb => cb(true));
}

export function stopSim(simId: string): void {
  const inst = getInstance(simId);
  if (!inst.running) return;
  inst.running = false;
  if (inst.intervalId !== null) {
    clearInterval(inst.intervalId);
    inst.intervalId = null;
  }
  // afterSim fires on any running→stopped transition: natural end (after()
  // returned false), manual Stop, or runtime error.
  runAfterSim(inst);
  inst.runningListeners.forEach(cb => cb(false));
}

export function resetSim(simId: string): void {
  const inst = getInstance(simId);
  stopSim(simId);
  inst.liveInputs = structuredClone(inst.defaultInputs);
  const freshState = structuredClone(inst.config.initialState);
  freshState.inputs = structuredClone(inst.liveInputs);
  inst.state = freshState;
  inst.history = [];
  inst.tick = 0;
  inst.error = null;
  inst.errorListeners.forEach(cb => cb(null));
  inst.inputsListeners.forEach(cb => cb(inst.liveInputs));
}

export function stageBlock(simId: string, sourceId: string, code: string): { ok: boolean; error?: string } {
  const inst = getInstance(simId);
  const block = inst.config.blocks.find(b => b.sourceId === sourceId);
  if (!block) return { ok: false, error: `Block "${sourceId}" not found` };

  const { fn: compiled, error: compileError } = compileBlock(code, block.exportName);
  if (!compiled) return { ok: false, error: compileError ?? 'Compilation failed — check syntax or function name' };

  inst.pendingFns[sourceId] = compiled;
  // A lifecycle block's source also defines its hook fns — recompile them so the
  // edited before/after/afterSim take effect on the next run.
  const hooks = lifecycleHooks(block);
  if (hooks.length > 0) {
    const { fns } = compileSource(code, hooks.map(h => h.exportName));
    for (const h of hooks) {
      const fn = fns[h.exportName];
      if (fn) inst.pendingFns[HOOK_KEY(sourceId, h.exportName)] = fn;
    }
  }
  inst.hasPending = true;
  localStorage.setItem(lsKey(simId, sourceId), code);
  return { ok: true };
}

export function revertBlock(simId: string, sourceId: string): void {
  const inst = getInstance(simId);
  const block = inst.config.blocks.find(b => b.sourceId === sourceId);
  if (!block) return;
  localStorage.removeItem(lsKey(simId, sourceId));
  delete inst.pendingFns[sourceId];
  inst.activeFns[sourceId] = block.defaultFn;
  // Restore default hook fns and drop any pending hook edits.
  for (const h of lifecycleHooks(block)) {
    const key = HOOK_KEY(sourceId, h.exportName);
    delete inst.pendingFns[key];
    inst.activeFns[key] = h.defaultFn as BlockFn;
  }
  inst.hasPending = Object.keys(inst.pendingFns).length > 0;
  // Reverting a static block restores its default consts — rebuild the slice.
  if (block.static) {
    const recomputed = computeStaticState(inst.config.blocks, inst.activeFns);
    inst.staticState = recomputed.staticState;
    inst.staticKeys = recomputed.staticKeys;
  }
}

export function getBlockCode(simId: string, sourceId: string): string {
  const inst = instances[simId];
  if (!inst) return '';
  const block = inst.config.blocks.find(b => b.sourceId === sourceId);
  if (!block) return '';
  return localStorage.getItem(lsKey(simId, sourceId)) ?? block.defaultCode;
}

export function getState(simId: string): ModelState {
  return instances[simId]?.state ?? {};
}

// The static slice (e.g. { K: {...} }). Charts/vis read this for non-time-varying
// data; it is NOT part of `getState`/`getHistory`, which are dynamic-only. Stable
// for the life of a run, so safe to read once per render.
export function getStatic(simId: string): ModelState {
  return instances[simId]?.staticState ?? {};
}

export function getHistory(simId: string): ModelState[] {
  return instances[simId]?.history ?? [];
}

export function getTick(simId: string): number {
  return instances[simId]?.tick ?? 0;
}

export function isRunning(simId: string): boolean {
  return instances[simId]?.running ?? false;
}

export function getError(simId: string): Error | null {
  return instances[simId]?.error ?? null;
}

export function hasPendingChanges(simId: string): boolean {
  return instances[simId]?.hasPending ?? false;
}

export function getConfig(simId: string): ModelConfig | null {
  return instances[simId]?.config ?? null;
}

export function subscribe(simId: string, cb: StateListener): () => void {
  const inst = getInstance(simId);
  inst.stateListeners.add(cb);
  return () => inst.stateListeners.delete(cb);
}

export function subscribeRunning(simId: string, cb: RunningListener): () => void {
  const inst = getInstance(simId);
  inst.runningListeners.add(cb);
  return () => inst.runningListeners.delete(cb);
}

export function subscribeError(simId: string, cb: ErrorListener): () => void {
  const inst = getInstance(simId);
  inst.errorListeners.add(cb);
  return () => inst.errorListeners.delete(cb);
}

// ── Inputs channel ────────────────────────────────────────────
// Sliders write here via setInput; values are applied to state at the start of
// the next tick. Subscribers are notified on every change (including reset).

export function setInput(simId: string, path: string, value: number | null): void {
  const inst = getInstance(simId);
  setPath(inst.liveInputs, path, value);
  inst.inputsListeners.forEach(cb => cb(inst.liveInputs));
}

export function getLiveInputs(simId: string): ModelState {
  return instances[simId]?.liveInputs ?? {};
}

export function subscribeInputs(simId: string, cb: InputsListener): () => void {
  const inst = getInstance(simId);
  inst.inputsListeners.add(cb);
  return () => inst.inputsListeners.delete(cb);
}
