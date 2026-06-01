import type { Scene, PerspectiveCamera } from 'three';
import type { ComponentType } from 'react';

// Recursive: leaves are numbers or null, sub-trees are nested objects, plus
// arrays of either (for block-published list data such as per-step waypoints).
// null leaves are used by the inputs channel to mean "use block-internal default".
export type ModelState = { [key: string]: number | null | ModelState | number[] | ModelState[] };
export type BlockFn = (local: ModelState) => ModelState;

// Resolve a dotted path to a number leaf. Returns 0 if the path is missing,
// null, or doesn't land on a number. Used by charts to plot deeply-nested
// values. Numeric segments index into arrays (e.g. "step.waypoints.0.x").
export function getPath(state: ModelState, path: string): number {
  const parts = path.split('.');
  let cur: number | null | ModelState | number[] | ModelState[] | undefined = state;
  for (const p of parts) {
    if (cur === null || cur === undefined) return 0;
    if (Array.isArray(cur)) {
      cur = cur[Number(p)];
    } else if (typeof cur === 'object') {
      cur = cur[p];
    } else {
      return 0;
    }
  }
  return typeof cur === 'number' ? cur : 0;
}

// Write a number or null at a dotted path, creating intermediate objects as needed.
// Used by the inputs channel to set slider values from UI. Bails if traversal
// crosses an array — inputs are scalar paths under `state.inputs.<sourceId>.<key>`
// and never cross block-published list data.
export function setPath(state: ModelState, path: string, value: number | null): void {
  const parts = path.split('.');
  let cur: ModelState = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (Array.isArray(next)) return;
    if (typeof next !== 'object' || next === null) {
      const obj: ModelState = {};
      cur[parts[i]] = obj;
      cur = obj;
    } else {
      cur = next;
    }
  }
  cur[parts[parts.length - 1]] = value;
}

export interface BlockConfig {
  sourceId: string;
  exportName: string;
  defaultFn: BlockFn;
  defaultCode: string;
  mapStateIn: (state: ModelState) => ModelState;
  mapStateOut: (out: ModelState, state: ModelState) => ModelState;
  tickFrequency: number;
  // Per-block input schema. Keys + defaults are namespaced under
  // `state.inputs.<sourceId>` and writable via `setInput`. Defaults of `null`
  // signal "use block-internal default" to the block's code.
  inputs?: ModelState;
  // Static blocks run ONCE before the tick loop (and on reset / when staged code
  // is applied), never per tick. Their output populates the static slice, which
  // every tick's block sees merged into its input but which is NOT duplicated
  // into per-tick history. `staticKeys` declares which top-level state keys this
  // block contributes to that slice (e.g. ['K']). A non-static block ignores
  // both fields.
  static?: boolean;
  staticKeys?: string[];
  // Optional lifecycle hooks. A block may export extra fns beyond `exportName`
  // (its source compiles them all together) that the engine calls around the
  // tick loop and on stop. The quad `lifecycle` block uses this: `exportName` is
  // `beforeSim` (the static consts bag), plus `before`/`after` per-tick hooks and
  // an `afterSim` stop hook. See LifecycleConfig.
  lifecycle?: LifecycleConfig;
}

// A lifecycle fn may signal a stop by returning false (used by `after`). It
// receives the dynamic state with the static slice (e.g. `K`) and the current
// tick index (`tick`) merged in, and returns the mutated state (or false). The
// engine strips the injected static keys + `tick` before persisting, so a hook
// can read `K`/`tick` freely without leaking them into history.
export type HookFn = (local: ModelState) => ModelState | false;

// A lifecycle hook: an export name plus its compiled-from-source default fn.
// When the lifecycle block's source is edited, the engine recompiles this hook's
// `exportName` from the shared source and swaps the fn in.
export interface LifecycleHook {
  exportName: string;
  defaultFn: HookFn;
}

export interface LifecycleConfig {
  // Runs each tick BEFORE the block loop.
  before?: LifecycleHook;
  // Runs each tick AFTER the block loop. Returning `false` stops the sim (the
  // tick is still committed) and triggers afterSim.
  after?: LifecycleHook;
  // Runs once when the sim stops (natural end, manual stop, or error). Its
  // return is ignored (used for teardown/summary).
  afterSim?: LifecycleHook;
}

export interface SceneHandler {
  init(scene: Scene, camera: PerspectiveCamera, container: HTMLElement): void;
  // `staticState` is the run's static slice (e.g. { K }). It is NOT in `state`
  // or `history` — handlers that render static data (labels, gates sized by a
  // const) read it from here. Stable for the whole run.
  update(state: ModelState, tick: number, history: ModelState[], staticState: ModelState): void;
  dispose(scene: Scene): void;
}

export interface ChartSeries {
  // Dynamic value path, resolved against each `state`/`history[i]`.
  var?: string;
  // Static value path, resolved against the run's static slice (e.g.
  // 'K.MAX_THRUST_N'). Plotted as a flat line across the time axis. Mutually
  // exclusive with `var`/`fn`.
  staticVar?: string;
  label: string;
  color: string;
  // `staticState` is the run's static slice — lets a series combine dynamic and
  // const data (e.g. normalize position by a const altitude).
  fn?: (state: ModelState, staticState: ModelState) => number;
}

export interface ChartConfig {
  label: string;
  series: ChartSeries[];
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ModelConfig {
  modelId: string;
  tickIntervalMs: number;
  initialState: ModelState;
  blocks: BlockConfig[];
  // The model's visualization. <SimVis> renders this as a child and exposes
  // engine plumbing via the useSimVis() context. Three.js models export a
  // component that wraps <ThreeCanvas sceneHandler={…} />; 2D models export
  // their React component (SVG/HTML) directly. Convention: this component
  // lives at <modelId>.vis.tsx alongside the config.
  vis: ComponentType;
  charts: ChartConfig[];
  // Each entry is an always-visible edge in the blocks diagram.
  // Absent → fallback to sequential block pairs that share variables.
  blocksDiagram?: DiagramEdge[];
}
