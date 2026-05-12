import type { Scene, PerspectiveCamera } from 'three';

export type ModelState = Record<string, number>;
export type BlockFn = (local: ModelState) => ModelState;

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
