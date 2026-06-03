// cornerGroup — positions multiple overlay plugins at a corner, stacking them
// vertically with flex layout. Children are ordered top-to-bottom (first child
// appears at the top of the stack, last child is closest to the screen edge).
//
// Handles corner positioning centrally; child plugins should not receive a
// `corner` option — their absolute positioning is stripped and replaced by flex.
//
// Usage:
//   cornerGroup('bottom-left', [
//     infoOverlay({ rows: [...] }),
//     sticksOverlay(s => view(s).aetr),
//   ])

import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface CornerGroupOptions {
  margin?: number; // px from viewport edge, default 12
  gap?: number;    // px gap between children, default 8
}

export function cornerGroup(
  corner: Corner,
  children: ScenePlugin[],
  opts: CornerGroupOptions = {},
): ScenePlugin {
  const { margin = 12, gap = 8 } = opts;

  let groupEl: HTMLDivElement | null = null;

  return {
    init(scene: Scene, camera: PerspectiveCamera, container: HTMLElement) {
      if (!container.style.position) container.style.position = 'relative';

      groupEl = document.createElement('div');
      const m = `${margin}px`;

      // column: first child in array = top of stack; container grows toward the
      // anchor edge so the last child ends up closest to the screen edge.
      // align-items mirrors the anchor side so each child hugs the correct edge.
      const isRight = corner === 'bottom-right' || corner === 'top-right';
      Object.assign(groupEl.style, {
        position:      'absolute',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    isRight ? 'flex-end' : 'flex-start',
        gap:           `${gap}px`,
        pointerEvents: 'none',
        zIndex:        '5',
      } as Partial<CSSStyleDeclaration>);

      groupEl.style.top = groupEl.style.right = groupEl.style.bottom = groupEl.style.left = '';
      if (corner === 'bottom-left')  { groupEl.style.bottom = m; groupEl.style.left  = m; }
      if (corner === 'bottom-right') { groupEl.style.bottom = m; groupEl.style.right = m; }
      if (corner === 'top-left')     { groupEl.style.top    = m; groupEl.style.left  = m; }
      if (corner === 'top-right')    { groupEl.style.top    = m; groupEl.style.right = m; }
      container.appendChild(groupEl);

      for (const child of children) {
        const prevCount = groupEl.children.length;
        child.init(scene, camera, groupEl);
        // Strip the absolute corner-positioning each child applied to its root
        // div — flex layout handles placement instead.
        for (let i = prevCount; i < groupEl.children.length; i++) {
          const el = groupEl.children[i] as HTMLElement;
          el.style.position = 'relative';
          el.style.top = el.style.right = el.style.bottom = el.style.left = '';
        }
      }
    },

    update(state: ModelState, tick: number, history: ModelState[], staticState: ModelState) {
      for (const child of children) child.update(state, tick, history, staticState);
    },

    dispose(scene: Scene) {
      for (const child of children) child.dispose(scene);
      groupEl?.remove();
      groupEl = null;
    },
  };
}
