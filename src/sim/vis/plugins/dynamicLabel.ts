// Dynamic text sprite — like textLabel but the text updates from state each tick.
// Regenerates the canvas texture only when the getter returns a new string.

import * as THREE from 'three';
import type { ScenePlugin } from '../scenePlugin';
import type { ModelState } from '../../engine/types';

export interface DynamicLabelOptions {
  getText: (state: ModelState) => string;     // called every update tick
  position: [number, number, number];
  color?: string;            // default '#ffaa44'
  fontSize?: number;         // default 36
  pixelsPerUnit?: number;    // default 50
}

export function dynamicLabel(options: DynamicLabelOptions): ScenePlugin {
  let sprite: THREE.Sprite | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let texture: THREE.CanvasTexture | null = null;
  let lastText: string | null = null;

  const {
    position,
    color         = '#ffaa44',
    fontSize      = 36,
    pixelsPerUnit = 50,
  } = options;

  const PAD = 16;
  const LINE_H = fontSize + 8;
  const FONT = `${fontSize}px monospace`;

  function redraw(text: string) {
    if (!canvas || !texture || !sprite) return;
    const lines = text.split('\n');
    const probe = canvas.getContext('2d')!;
    probe.font = FONT;
    const maxW = Math.max(...lines.map(l => probe.measureText(l).width));
    const w = Math.ceil(maxW) + PAD * 2;
    const h = LINE_H * lines.length + PAD;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.font = FONT;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      const y = PAD / 2 + LINE_H * i + LINE_H / 2;
      ctx.fillText(line, w / 2, y);
    });
    texture.needsUpdate = true;
    sprite.scale.set(w / pixelsPerUnit, h / pixelsPerUnit, 1);
  }

  return {
    init(scene) {
      canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      texture = new THREE.CanvasTexture(canvas);
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, depthTest: false, transparent: true,
      }));
      sprite.position.set(...position);
      scene.add(sprite);
    },
    update(state) {
      const text = options.getText(state);
      if (text !== lastText) {
        lastText = text;
        redraw(text);
      }
    },
    dispose(scene) {
      if (sprite) {
        scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        sprite.material.dispose();
      }
      sprite = null; canvas = null; texture = null; lastText = null;
    },
  };
}
