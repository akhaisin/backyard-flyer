// Static text sprite rendered at a fixed world-space position.
// Uses a canvas texture — same pattern as the phase label in quadMesh.ts.
// The sprite always faces the camera (THREE.Sprite behaviour).
//
// Usage:
//   textLabel({
//     text: 'Short description',
//     position: [-10, 0, -10],
//   })

import * as THREE from 'three';
import type { ScenePlugin } from '../scenePlugin';

export interface TextLabelOptions {
  text: string;             // '\n' splits into multiple lines
  position: [number, number, number];
  color?: string;           // CSS color, default '#888888'
  fontSize?: number;        // canvas px, default 28 — also scales world-space size
  pixelsPerUnit?: number;   // canvas px per scene unit, default 50 (higher = smaller label)
}

export function textLabel(options: TextLabelOptions): ScenePlugin {
  let sprite: THREE.Sprite | null = null;

  return {
    init(scene) {
      const {
        text,
        position,
        color         = '#888888',
        fontSize      = 36,
        pixelsPerUnit = 50,
      } = options;

      const lines = text.split('\n');
      const lineH = fontSize + 8;
      const pad   = 16;
      const font  = `${fontSize}px monospace`;

      // Measure line widths before committing canvas size.
      const probe = document.createElement('canvas').getContext('2d')!;
      probe.font = font;
      const maxTextW = Math.max(...lines.map(l => probe.measureText(l).width));

      const canvasW = Math.ceil(maxTextW) + pad * 2;
      const canvasH = lineH * lines.length + pad;

      const canvas = document.createElement('canvas');
      canvas.width  = canvasW;
      canvas.height = canvasH;

      // Setting canvas.width resets the 2d context — re-apply font after resize.
      const ctx = canvas.getContext('2d')!;
      ctx.font         = font;
      ctx.fillStyle    = color;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      lines.forEach((line, i) => {
        const y = pad / 2 + lineH * i + lineH / 2;
        ctx.fillText(line, canvasW / 2, y);
      });

      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
          transparent: true,
        }),
      );
      sprite.scale.set(canvasW / pixelsPerUnit, canvasH / pixelsPerUnit, 1);
      sprite.position.set(...position);
      scene.add(sprite);
    },

    update() {},

    dispose(scene) {
      if (!sprite) return;
      scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
      sprite = null;
    },
  };
}
