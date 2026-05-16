import type { Scene, PerspectiveCamera } from 'three';

// Recursive: leaves are numbers, sub-trees are nested objects.
// Flat states (e.g. `{ value: 0 }`) remain valid — they're just trees with depth 1.
export type ModelState = { [key: string]: number | ModelState };
export type BlockFn = (local: ModelState) => ModelState;

// Resolve a dotted path to a number leaf. Returns 0 if the path is missing
// or doesn't land on a number. Used by charts to plot deeply-nested values.
export function getPath(state: ModelState, path: string): number {
  const parts = path.split('.');
  let cur: number | ModelState | undefined = state;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return 0;
    cur = (cur as ModelState)[p];
  }
  return typeof cur === 'number' ? cur : 0;
}

export interface BlockConfig {
  sourceId: string;
  exportName: string;
  defaultFn: BlockFn;
  defaultCode: string;
  mapStateIn: (state: ModelState) => ModelState;
  mapStateOut: (out: ModelState, state: ModelState) => ModelState;
  tickFrequency: number;
}

export interface SceneHandler {
  init(scene: Scene, camera: PerspectiveCamera): void;
  update(state: ModelState, tick: number, history: ModelState[]): void;
  dispose(scene: Scene): void;
}

export interface ChartSeries {
  var: string;
  label: string;
  color: string;
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
  sceneHandler: () => SceneHandler;
  charts: ChartConfig[];
}
