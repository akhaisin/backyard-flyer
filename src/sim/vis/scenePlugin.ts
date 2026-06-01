import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState, SceneHandler } from '../engine/types';

export interface ScenePlugin {
  // `container` is the DOM element that wraps the WebGL canvas — plugins that
  // render HTML overlays (e.g. infoOverlay) attach into it. THREE-only plugins
  // can ignore it.
  init(scene: Scene, camera: PerspectiveCamera, container: HTMLElement): void;
  // `staticState` is the run's static slice (e.g. { K }); not part of `state`/
  // `history`. Optional in the param list so plugins that ignore it stay terse.
  update(state: ModelState, tick: number, history: ModelState[], staticState: ModelState): void;
  dispose(scene: Scene): void;
}

export function composeScene(factory: () => ScenePlugin[]): () => SceneHandler {
  return () => {
    const plugins = factory();
    return {
      init: (scene, camera, container) => plugins.forEach(p => p.init(scene, camera, container)),
      update: (state, tick, history, staticState) => plugins.forEach(p => p.update(state, tick, history, staticState)),
      dispose: (scene) => plugins.forEach(p => p.dispose(scene)),
    };
  };
}
