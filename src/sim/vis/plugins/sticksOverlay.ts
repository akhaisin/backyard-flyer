// RC transmitter sticks overlay — two squares visualizing AETR stick positions.
//
// Left square  (Mode-2 left stick):  Throttle (vertical) / Yaw (horizontal)
// Right square (Mode-2 right stick): Pitch    (vertical) / Roll (horizontal)
//
// Throttle maps 0→bottom, 1→top. All other axes map −1→left/bottom, +1→right/top.
// The overlay follows the internal AETR bus directly: +yaw = dot right,
// +pitch = dot up, +roll = dot right.
//
// Usage:
//   sticksOverlay(s => view(s).aetr)
//   sticksOverlay(s => view(s).aetr, { corner: 'bottom-right', size: 90 })

import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export type SticksOverlayCorner =
  | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface SticksOverlayOptions {
  corner?: SticksOverlayCorner; // default 'bottom-right'
  margin?: number;              // px from corner, default 12
  size?: number;                // stick square side length in px, default 80
  gap?: number;                 // gap between the two squares, default 16
}

interface Aetr {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

const BG          = 'rgba(10, 10, 18, 0.88)';
const BORDER      = 'rgba(80, 100, 130, 0.7)';
const AXIS        = 'rgba(80, 100, 130, 0.45)';
const DOT_FILL    = 'rgba(80, 210, 255, 0.95)';
const DOT_GLOW    = 'rgba(80, 210, 255, 0.25)';
const LABEL_COLOR = 'rgba(160, 180, 200, 0.75)';
const DOT_RADIUS  = 5;
const GLOW_RADIUS = 11;

function applyCorner(
  el: HTMLElement,
  corner: SticksOverlayCorner,
  margin: number,
) {
  const m = `${margin}px`;
  el.style.top = el.style.right = el.style.bottom = el.style.left = '';
  if (corner === 'bottom-left')  { el.style.bottom = m; el.style.left  = m; }
  if (corner === 'bottom-right') { el.style.bottom = m; el.style.right = m; }
  if (corner === 'top-left')     { el.style.top    = m; el.style.left  = m; }
  if (corner === 'top-right')    { el.style.top    = m; el.style.right = m; }
}

function drawStick(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  sz: number,
  dotX: number, dotY: number,
  label: string,
) {
  const r = 4;

  // Background with rounded corners.
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.roundRect(ox, oy, sz, sz, r);
  ctx.fill();

  // Border.
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(ox, oy, sz, sz, r);
  ctx.stroke();

  // Center crosshairs.
  const cx = ox + sz / 2;
  const cy = oy + sz / 2;
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, oy + 4); ctx.lineTo(cx, oy + sz - 4);
  ctx.moveTo(ox + 4, cy); ctx.lineTo(ox + sz - 4, cy);
  ctx.stroke();

  // Dot glow.
  const grd = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, GLOW_RADIUS);
  grd.addColorStop(0, DOT_GLOW);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(dotX, dotY, GLOW_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Dot.
  ctx.fillStyle = DOT_FILL;
  ctx.beginPath();
  ctx.arc(dotX, dotY, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Label below.
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, ox + sz / 2, oy + sz + 12);
}

export function sticksOverlay(
  getAetr: (state: ModelState) => Aetr,
  opts: SticksOverlayOptions = {},
): ScenePlugin {
  const {
    corner = 'bottom-right',
    margin = 12,
    size   = 80,
    gap    = 16,
  } = opts;

  const LABEL_H = 16;
  const PAD     = 8;
  const canvasW = PAD + size + gap + size + PAD;
  const canvasH = PAD + size + LABEL_H + PAD;

  let root:   HTMLDivElement   | null = null;
  let canvas: HTMLCanvasElement| null = null;
  let ctx:    CanvasRenderingContext2D | null = null;

  function draw(aetr: Aetr) {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);

    const half  = size / 2;
    const leftX = PAD;
    const rightX = PAD + size + gap;
    const topY   = PAD;

    const thr   = isFinite(aetr.throttle) ? aetr.throttle : 0;
    const yaw   = isFinite(aetr.yaw)      ? aetr.yaw      : 0;
    const pitch = isFinite(aetr.pitch)    ? aetr.pitch    : 0;
    const roll  = isFinite(aetr.roll)     ? aetr.roll     : 0;

    // Left stick: throttle (vertical 0→top) / yaw (horizontal −1→+1, right = yaw right)
    const lDotX = leftX  + half + yaw * (half - DOT_RADIUS - 2);
    const lDotY = topY   + half - (thr * 2 - 1) * (half - DOT_RADIUS - 2);
    drawStick(ctx, leftX, topY, size, lDotX, lDotY, 'THR / YAW');

    // Right stick: pitch (vertical −1→+1) / roll (horizontal −1→+1)
    const rDotX = rightX + half + roll  * (half - DOT_RADIUS - 2);
    const rDotY = topY   + half - pitch * (half - DOT_RADIUS - 2);
    drawStick(ctx, rightX, topY, size, rDotX, rDotY, 'PITCH / ROLL');
  }

  return {
    init(_scene, _camera, container) {
      if (!container.style.position) container.style.position = 'relative';

      root = document.createElement('div');
      Object.assign(root.style, {
        position:      'absolute',
        pointerEvents: 'none',
        zIndex:        '5',
      } as Partial<CSSStyleDeclaration>);
      applyCorner(root, corner, margin);

      canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(canvasW * dpr);
      canvas.height = Math.round(canvasH * dpr);
      canvas.style.width  = `${canvasW}px`;
      canvas.style.height = `${canvasH}px`;
      canvas.style.display = 'block';
      ctx = canvas.getContext('2d');

      root.appendChild(canvas);
      container.appendChild(root);

      // Draw neutral position immediately so the overlay is visible before the
      // first tick.
      draw({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
    },
    update(state) {
      draw(getAetr(state));
    },
    dispose() {
      root?.remove();
      root = null;
      canvas = null;
      ctx = null;
    },
  };
}
