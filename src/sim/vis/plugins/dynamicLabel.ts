// Dynamic text sprite — like textLabel but the text updates from state each tick.
// Canvas dimensions are FIXED at creation; we clearRect+redraw on text change.
// Resizing the canvas after creation breaks Three.js's CanvasTexture upload
// (it caches the original GL texture dimensions), so we pick a generous
// canvas size up front and accept extra padding for short labels.
//
// This mirrors the pattern in quadMesh.ts's phase-label sprite, which is the
// reference implementation for dynamic canvas-backed sprites in this project.

import * as THREE from 'three';
import type { ScenePlugin } from '../scenePlugin';
import type { ModelState } from '../../engine/types';

export interface DynamicLabelOptions {
  getText: (state: ModelState) => string;
  position: [number, number, number];
  color?: string;            // default '#ffaa44'
  fontSize?: number;         // default 32
  canvasSize?: [number, number];   // default [320, 80] — must fit the longest expected text
  pixelsPerUnit?: number;    // default 50; controls world-space sprite scale
}

export function dynamicLabel(options: DynamicLabelOptions): ScenePlugin {
  let sprite: THREE.Sprite | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let lastText: string | null = null;

  const {
    position,
    color         = '#ffaa44',
    fontSize      = 32,
    canvasSize    = [320, 80],
    pixelsPerUnit = 50,
  } = options;

  const FONT = `${fontSize}px monospace`;
  const [W, H] = canvasSize;

  return {
    init(scene) {
      canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        transparent: true,
      }));
      sprite.scale.set(W / pixelsPerUnit, H / pixelsPerUnit, 1);
      sprite.position.set(...position);
      scene.add(sprite);
    },
    update(state) {
      if (!canvas || !sprite) return;
      const text = options.getText(state);
      if (text === lastText) return;
      lastText = text;

      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      ctx.font = FONT;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = text.split('\n');
      const lineH = fontSize + 4;
      const totalH = lineH * lines.length;
      lines.forEach((line, i) => {
        const y = H / 2 - totalH / 2 + lineH / 2 + lineH * i;
        ctx.fillText(line, W / 2, y);
      });
      (sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    },
    dispose(scene) {
      if (sprite) {
        scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        sprite.material.dispose();
      }
      sprite = null; canvas = null; lastText = null;
    },
  };
}
