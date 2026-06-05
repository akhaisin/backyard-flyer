// HTML overlay that renders a labelled two-position toggle switch.
//
// The switch mutates a shared ToggleRef object — any other plugin that holds a
// reference to the same object reads the updated value on the next tick without
// any extra wiring. This is the idiomatic way to share state between vis plugins
// in this codebase: create the ref in the composeScene factory and pass it to
// every plugin that needs it.
//
// Usage (standalone):
//   const guidesRef = { enabled: true };
//   toggleOverlay('Guides', guidesRef, { corner: 'bottom-left' })
//
// Usage inside cornerGroup (corner is stripped by the group, do not pass it):
//   const guidesRef = { enabled: true };
//   cornerGroup('bottom-left', [
//     toggleOverlay('Guides', guidesRef),
//     infoOverlay({ ... }),
//   ])
//
// Wire to windowGate:
//   windowGate(getState, windows, { drawGuides: guidesRef })

import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export type ToggleRef = { enabled: boolean };

export type ToggleOverlayCorner =
  | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface ToggleOverlayOptions {
  corner?: ToggleOverlayCorner; // default 'bottom-left'; stripped when inside cornerGroup
  margin?: number;              // px from corner, default 12
}

const BG         = 'rgba(0, 0, 0, 0.55)';
const TRACK_OFF  = '#444455';
const TRACK_ON   = '#44dd66';
const THUMB      = '#ffffff';

function applyCorner(
  el: HTMLElement,
  corner: ToggleOverlayCorner,
  margin: number,
) {
  const m = `${margin}px`;
  el.style.top = el.style.right = el.style.bottom = el.style.left = '';
  if (corner === 'bottom-left')  { el.style.bottom = m; el.style.left  = m; }
  if (corner === 'bottom-right') { el.style.bottom = m; el.style.right = m; }
  if (corner === 'top-left')     { el.style.top    = m; el.style.left  = m; }
  if (corner === 'top-right')    { el.style.top    = m; el.style.right = m; }
}

export function toggleOverlay(
  label: string,
  ref: ToggleRef,
  opts: ToggleOverlayOptions = {},
): ScenePlugin {
  const { corner = 'bottom-left', margin = 12 } = opts;

  let root:  HTMLDivElement  | null = null;
  let track: HTMLDivElement  | null = null;
  let thumb: HTMLDivElement  | null = null;

  function syncVisual() {
    if (!track || !thumb) return;
    track.style.background = ref.enabled ? TRACK_ON : TRACK_OFF;
    thumb.style.transform  = ref.enabled ? 'translateX(16px)' : 'translateX(0)';
  }

  return {
    init(_scene: Scene, _camera: PerspectiveCamera, container: HTMLElement) {
      if (!container.style.position) container.style.position = 'relative';

      root = document.createElement('div');
      Object.assign(root.style, {
        position:      'absolute',
        pointerEvents: 'auto',       // must be clickable
        display:       'flex',
        alignItems:    'center',
        gap:           '10px',
        fontFamily:    'monospace',
        fontSize:      '12px',
        color:         'rgba(255, 255, 255, 0.85)',
        background:    BG,
        padding:       '6px 10px',
        borderRadius:  '4px',
        userSelect:    'none',
        cursor:        'pointer',
        zIndex:        '5',
      } as Partial<CSSStyleDeclaration>);
      applyCorner(root, corner, margin);

      // Label
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      labelEl.style.color = 'rgba(255, 255, 255, 0.55)';
      root.appendChild(labelEl);

      // Toggle track (pill outline)
      track = document.createElement('div');
      Object.assign(track.style, {
        position:     'relative',
        width:        '34px',
        height:       '18px',
        borderRadius: '9999px',
        transition:   'background 0.15s',
        flexShrink:   '0',
      } as Partial<CSSStyleDeclaration>);

      // Toggle thumb (circle inside the track)
      thumb = document.createElement('div');
      Object.assign(thumb.style, {
        position:     'absolute',
        top:          '2px',
        left:         '2px',
        width:        '14px',
        height:       '14px',
        borderRadius: '50%',
        background:   THUMB,
        transition:   'transform 0.15s',
        boxShadow:    '0 1px 3px rgba(0,0,0,0.4)',
      } as Partial<CSSStyleDeclaration>);

      track.appendChild(thumb);
      root.appendChild(track);
      container.appendChild(root);

      // Initialise visual state immediately.
      syncVisual();

      root.addEventListener('click', () => {
        ref.enabled = !ref.enabled;
        syncVisual();
      });
    },

    update(_state: ModelState) {
      // No per-tick update needed — the click handler keeps the visual in sync.
    },

    dispose(_scene: Scene) {
      root?.remove();
      root  = null;
      track = null;
      thumb = null;
    },
  };
}
