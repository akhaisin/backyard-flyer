import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState, SceneHandler } from '../engine/types';

export interface ScenePlugin {
  // `container` is the DOM element that wraps the WebGL canvas — plugins that
  // render HTML overlays (e.g. infoOverlay) attach into it. THREE-only plugins
  // can ignore it.
  init(scene: Scene, camera: PerspectiveCamera, container: HTMLElement): void;
  update(state: ModelState, tick: number, history: ModelState[]): void;
  dispose(scene: Scene): void;
}

export function composeScene(factory: () => ScenePlugin[]): () => SceneHandler {
  return () => {
    const plugins = factory();
    return {
      init: (scene, camera, container) => plugins.forEach(p => p.init(scene, camera, container)),
      update: (state, tick, history) => plugins.forEach(p => p.update(state, tick, history)),
      dispose: (scene) => plugins.forEach(p => p.dispose(scene)),
    };
  };
}
