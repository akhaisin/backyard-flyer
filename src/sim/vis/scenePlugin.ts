import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState, SceneHandler } from '../engine/types';

export interface ScenePlugin {
  init(scene: Scene, camera: PerspectiveCamera): void;
  update(state: ModelState, tick: number, history: ModelState[]): void;
  dispose(scene: Scene): void;
}

export function composeScene(factory: () => ScenePlugin[]): () => SceneHandler {
  return () => {
    const plugins = factory();
    return {
      init: (scene, camera) => plugins.forEach(p => p.init(scene, camera)),
      update: (state, tick, history) => plugins.forEach(p => p.update(state, tick, history)),
      dispose: (scene) => plugins.forEach(p => p.dispose(scene)),
    };
  };
}
