import { stripTypes } from './stripTypes';
import type { ModelConfig, ModelState, BlockFn } from './types';

const LS_PREFIX = 'backyard-flyer.sims';
const LS_VERSION = 'v1';

function lsKey(simId: string, sourceId: string): string {
  return `${LS_PREFIX}.${simId}.${LS_VERSION}.sources.${sourceId}`;
}

type StateListener = (state: ModelState, tick: number) => void;
type RunningListener = (running: boolean) => void;
type ErrorListener = (error: Error | null) => void;

interface SimInstance {
  config: ModelConfig;
  state: ModelState;
  history: ModelState[];
  tick: number;
  activeFns: Record<string, BlockFn>;
  pendingFns: Record<string, BlockFn>;
  hasPending: boolean;
  running: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  error: Error | null;
  stateListeners: Set<StateListener>;
  runningListeners: Set<RunningListener>;
  errorListeners: Set<ErrorListener>;
}

const instances: Record<string, SimInstance> = {};

function compileBlock(code: string, exportName: string): { fn: BlockFn | null; error: string | null } {
  const js = stripTypes(code);
  try {
    const mod: Record<string, unknown> = {};
    new Function('exports', `${js}\nexports['${exportName}'] = typeof ${exportName} !== 'undefined' ? ${exportName} : undefined;`)(mod);
    const fn = mod[exportName];
    if (typeof fn !== 'function') {
      return { fn: null, error: `Export "${exportName}" not found — check the function name` };
    }
    return { fn: fn as BlockFn, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[sim] Compile error in "${exportName}":`, e);
    return { fn: null, error: msg };
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
  }

  instances[simId] = {
    config,
    state: structuredClone(config.initialState),
    history: [],
    tick: 0,
    activeFns,
    pendingFns: {},
    hasPending: false,
    running: false,
    intervalId: null,
    error: null,
    stateListeners: new Set(),
    runningListeners: new Set(),
    errorListeners: new Set(),
  };
}

function getInstance(simId: string): SimInstance {
  const inst = instances[simId];
  if (!inst) throw new Error(`Sim "${simId}" not initialized — call initSim first`);
  return inst;
}

function doTick(simId: string): void {
  const inst = getInstance(simId);
  let state = inst.state;

  for (const block of inst.config.blocks) {
    if (inst.tick % block.tickFrequency !== 0) continue;
    const localIn = block.mapStateIn(state);
    try {
      const localOut = inst.activeFns[block.sourceId](localIn);
      state = block.mapStateOut(localOut, state);
    } catch (e) {
      stopSim(simId);
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`[sim:${simId}] Runtime error in block "${block.sourceId}":`, e);
      inst.error = error;
      inst.errorListeners.forEach(cb => cb(error));
      return;
    }
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
    inst.state = structuredClone(inst.config.initialState);
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
  inst.runningListeners.forEach(cb => cb(false));
}

export function resetSim(simId: string): void {
  const inst = getInstance(simId);
  stopSim(simId);
  inst.state = structuredClone(inst.config.initialState);
  inst.history = [];
  inst.tick = 0;
  inst.error = null;
  inst.errorListeners.forEach(cb => cb(null));
}

export function stageBlock(simId: string, sourceId: string, code: string): { ok: boolean; error?: string } {
  const inst = getInstance(simId);
  const block = inst.config.blocks.find(b => b.sourceId === sourceId);
  if (!block) return { ok: false, error: `Block "${sourceId}" not found` };

  const { fn: compiled, error: compileError } = compileBlock(code, block.exportName);
  if (!compiled) return { ok: false, error: compileError ?? 'Compilation failed — check syntax or function name' };

  inst.pendingFns[sourceId] = compiled;
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
  inst.hasPending = Object.keys(inst.pendingFns).length > 0;
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
