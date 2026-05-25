import type { Scene, PerspectiveCamera } from 'three';
import type { ComponentType } from 'react';

// Recursive: leaves are numbers or null, sub-trees are nested objects.
// null leaves are used by the inputs channel to mean "use block-internal default".
export type ModelState = { [key: string]: number | null | ModelState };
export type BlockFn = (local: ModelState) => ModelState;

// Resolve a dotted path to a number leaf. Returns 0 if the path is missing,
// null, or doesn't land on a number. Used by charts to plot deeply-nested values.
export function getPath(state: ModelState, path: string): number {
  const parts = path.split('.');
  let cur: number | null | ModelState | undefined = state;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return 0;
    cur = cur[p];
  }
  return typeof cur === 'number' ? cur : 0;
}

// Write a number or null at a dotted path, creating intermediate objects as needed.
// Used by the inputs channel to set slider values from UI.
export function setPath(state: ModelState, path: string, value: number | null): void {
  const parts = path.split('.');
  let cur: ModelState = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
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
}

export interface SceneHandler {
  init(scene: Scene, camera: PerspectiveCamera): void;
  update(state: ModelState, tick: number, history: ModelState[]): void;
  dispose(scene: Scene): void;
}

export interface ChartSeries {
  var?: string;
  label: string;
  color: string;
  fn?: (state: ModelState) => number;
}

export interface ChartConfig {
  label: string;
  series: ChartSeries[];
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
}
