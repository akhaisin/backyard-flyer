// HTML overlay pinned to a corner of the canvas container. Renders a small
// label/value table that updates from state each tick. Rows flagged with
// `plot: true` also contribute a compact line series to a canvas strip below
// the table — same color for label and series.
//
// Usage:
//   infoOverlay({
//     corner: 'bottom-left',
//     rows: [
//       { label: 'Total laps', display: s => String(view(s).laps) },
//       { label: 'Current err',
//         display: s => `${view(s).err.toFixed(3)} m`,
//         plot: true,
//         value: s => view(s).err,
//         color: '#ffaa44' },
//     ],
//   })

import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export type InfoOverlayCorner =
  | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export type InfoOverlayRow =
  | {
      label: string;
      display: (state: ModelState) => string;
      plot?: false;
      // Optional dynamic label color, evaluated each tick. Overrides the
      // default static color. Useful for pass/fail indicators.
      labelColor?: (state: ModelState) => string;
    }
  | {
      label: string;
      display: (state: ModelState) => string;
      plot: true;
      // Numeric series sampled from each history tick.
      value: (state: ModelState) => number;
      // Used for both label color and plot stroke color.
      color: string;
      labelColor?: (state: ModelState) => string;
    };

export interface InfoOverlayOptions {
  rows: InfoOverlayRow[];
  corner?: InfoOverlayCorner;     // default 'bottom-left'
  margin?: number;                // px from corner, default 12
  plotTicks?: number;             // history window for the plot strip, default 500
  plotHeight?: number;            // css px height of the plot strip, default 28
  // Static header rendered above the rows — useful when multiple overlays
  // share a scene and the viewer needs to distinguish which is which.
  title?: string;
  titleColor?: string;            // default 'rgba(255, 255, 255, 0.9)'
}

const DEFAULT_LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';

function applyCorner(el: HTMLElement, corner: InfoOverlayCorner, margin: number) {
  const m = `${margin}px`;
  el.style.top = el.style.right = el.style.bottom = el.style.left = '';
  if (corner === 'bottom-left')  { el.style.bottom = m; el.style.left = m; }
  if (corner === 'bottom-right') { el.style.bottom = m; el.style.right = m; }
  if (corner === 'top-left')     { el.style.top = m;    el.style.left = m; }
  if (corner === 'top-right')    { el.style.top = m;    el.style.right = m; }
}

export function infoOverlay(opts: InfoOverlayOptions): ScenePlugin {
  const {
    rows,
    corner = 'bottom-left',
    margin = 12,
    plotTicks = 500,
    plotHeight = 28,
    title,
    titleColor = 'rgba(255, 255, 255, 0.9)',
  } = opts;

  const plotIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) if (rows[i].plot) plotIndices.push(i);
  const hasPlot = plotIndices.length > 0;

  let root: HTMLDivElement | null = null;
  let valueCells: HTMLSpanElement[] = [];
  let labelCells: HTMLSpanElement[] = [];
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let ro: ResizeObserver | null = null;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = plotHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // Map drawing commands (issued in css px) to backing-store px.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPlot(history: ModelState[], tick: number) {
    if (!canvas || !ctx) return;
    const cssW = canvas.clientWidth;
    const cssH = plotHeight;
    ctx.clearRect(0, 0, cssW, cssH);
    if (history.length < 2) return;

    // Anchor the window to the playhead (tick) so rewind shows the correct
    // slice, not the latest 500 entries.
    const lastIdx = Math.min(Math.max(0, tick), history.length - 1);
    const endExclusive = lastIdx + 1;
    if (endExclusive < 2) return;
    const n = Math.min(plotTicks, endExclusive);
    const start = endExclusive - n;

    const series: number[][] = plotIndices.map(i => {
      const row = rows[i];
      // Type narrowing guarantees `value` exists when row.plot is true,
      // but TS can't see through the indexed access — cast inline.
      const get = (row as Extract<InfoOverlayRow, { plot: true }>).value;
      const data = new Array<number>(n);
      for (let t = 0; t < n; t++) data[t] = get(history[start + t]);
      return data;
    });

    // Fixed-width window: X axis always represents `plotTicks` cells. Samples
    // align to the right edge so the line grows in from the right until the
    // buffer is full, then scrolls left.
    const denom = plotTicks > 1 ? plotTicks - 1 : 1;
    const xOffset = plotTicks - n;

    for (let s = 0; s < plotIndices.length; s++) {
      const data = series[s];
      // Per-series Y normalization: each line uses the full strip for its
      // own min..max range, so mixed-unit series stay readable.
      let lo = Infinity, hi = -Infinity;
      for (const v of data) {
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (!Number.isFinite(lo)) continue;
      if (hi - lo < 1e-9) hi = lo + 1;
      const pad = (hi - lo) * 0.1;
      lo -= pad; hi += pad;
      const range = hi - lo;

      const row = rows[plotIndices[s]] as Extract<InfoOverlayRow, { plot: true }>;
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let t = 0; t < data.length; t++) {
        const x = ((xOffset + t) / denom) * cssW;
        const y = cssH - ((data[t] - lo) / range) * cssH;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  return {
    init(_scene, _camera, container) {
      if (!container.style.position) container.style.position = 'relative';

      root = document.createElement('div');
      Object.assign(root.style, {
        position:      'absolute',
        pointerEvents: 'none',
        fontFamily:    'monospace',
        fontSize:      '12px',
        lineHeight:    '1.4',
        color:         'rgba(255, 255, 255, 0.85)',
        background:    'rgba(0, 0, 0, 0.55)',
        padding:       '6px 10px',
        borderRadius:  '4px',
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
        zIndex:        '5',
      } as Partial<CSSStyleDeclaration>);
      applyCorner(root, corner, margin);

      if (title) {
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        Object.assign(titleEl.style, {
          color:         titleColor,
          fontWeight:    '600',
          letterSpacing: '0.04em',
        } as Partial<CSSStyleDeclaration>);
        root.appendChild(titleEl);
      }

      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display:             'grid',
        gridTemplateColumns: 'auto auto',
        columnGap:           '12px',
      } as Partial<CSSStyleDeclaration>);

      valueCells = [];
      labelCells = [];
      for (const row of rows) {
        const labelEl = document.createElement('span');
        labelEl.style.color = row.plot ? row.color : DEFAULT_LABEL_COLOR;
        labelEl.textContent = row.label;
        const valueEl = document.createElement('span');
        valueEl.style.textAlign = 'right';
        valueEl.style.fontVariantNumeric = 'tabular-nums';
        grid.appendChild(labelEl);
        grid.appendChild(valueEl);
        labelCells.push(labelEl);
        valueCells.push(valueEl);
      }
      root.appendChild(grid);

      if (hasPlot) {
        canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.width   = '100%';
        canvas.style.height  = `${plotHeight}px`;
        ctx = canvas.getContext('2d');
        root.appendChild(canvas);
        // Container width is content-driven (grid is auto-sized) — if labels
        // change width mid-run the canvas backing store must follow.
        ro = new ResizeObserver(() => resizeCanvas());
        ro.observe(canvas);
      }

      container.appendChild(root);
      if (canvas) resizeCanvas();
    },
    update(state, tick, history) {
      if (!root) return;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const text = row.display(state);
        if (valueCells[i].textContent !== text) {
          valueCells[i].textContent = text;
        }
        if (row.labelColor) {
          const color = row.labelColor(state);
          if (labelCells[i].style.color !== color) {
            labelCells[i].style.color = color;
          }
        }
      }
      if (canvas) drawPlot(history, tick);
    },
    dispose() {
      ro?.disconnect();
      ro = null;
      root?.remove();
      root = null;
      valueCells = [];
      labelCells = [];
      canvas = null;
      ctx = null;
    },
  };
}
