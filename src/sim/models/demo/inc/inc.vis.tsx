import * as THREE from 'three';
import ThreeCanvas from '../../../components/ThreeCanvas';
import type { SceneHandler, ModelState } from '../../../engine/types';

function createSceneHandler(): SceneHandler {
  let sprite: THREE.Sprite | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let texture: THREE.CanvasTexture | null = null;

  function drawValue(value: number): void {
    if (!ctx || !canvas || !texture) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 140px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }

  return {
    init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
      scene.background = new THREE.Color(0x111111);

      canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      ctx = canvas.getContext('2d');
      texture = new THREE.CanvasTexture(canvas);

      const mat = new THREE.SpriteMaterial({ map: texture });
      sprite = new THREE.Sprite(mat);
      sprite.scale.set(5, 2.5, 1);
      scene.add(sprite);

      const axesHelper = new THREE.AxesHelper(0.5);
      scene.add(axesHelper);

      camera.position.set(0, 0, 6);
      camera.lookAt(0, 0, 0);

      drawValue(0);
    },

    update(state: ModelState): void {
      drawValue(Math.round((state.value as number) ?? 0));
    },

    dispose(scene: THREE.Scene): void {
      if (sprite) scene.remove(sprite);
      texture?.dispose();
      sprite = null;
      canvas = null;
      ctx = null;
      texture = null;
    },
  };
}

export default function IncVis() {
  return <ThreeCanvas sceneHandler={createSceneHandler} />;
}
