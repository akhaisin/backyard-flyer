// flashBanner — HTML text banner anchored to the bottom-centre of the vis
// container. Fires when `getCounter` returns a value larger than the previous
// tick, then fades to transparent over `fadeTicks` simulation ticks.

import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export interface FlashBannerOpts {
  text:       string;
  fadeTicks:  number;
  getCounter: (state: ModelState) => number;
  color?:     string;
  fontSize?:  number;
}

export function flashBanner(opts: FlashBannerOpts): ScenePlugin {
  const { text, fadeTicks, getCounter, color = '#ff4444', fontSize = 20 } = opts;
  let el: HTMLDivElement | null = null;
  let ticksLeft = 0;
  let prevCount = -1;

  return {
    init(_scene, _camera, container) {
      el = document.createElement('div');
      Object.assign(el.style, {
        position:      'absolute',
        bottom:        '50px',
        left:          '50%',
        transform:     'translateX(-50%)',
        color,
        fontFamily:    'monospace',
        fontSize:      `${fontSize}px`,
        fontWeight:    'bold',
        letterSpacing: '0.12em',
        pointerEvents: 'none',
        opacity:       '0',
        textShadow:    `0 0 10px ${color}`,
        whiteSpace:    'nowrap',
        zIndex:        '10',
      } as Partial<CSSStyleDeclaration>);
      el.textContent = text;
      container.appendChild(el);
      ticksLeft = 0;
      prevCount = -1;
    },

    update(state) {
      if (!el) return;
      const count = Math.round(getCounter(state));
      if (prevCount >= 0 && count > prevCount) ticksLeft = fadeTicks;
      prevCount = count;
      if (ticksLeft > 0) ticksLeft--;
      el.style.opacity = String(ticksLeft / fadeTicks);
    },

    dispose() {
      if (el) el.remove();
      el = null;
      ticksLeft = 0;
      prevCount = -1;
    },
  };
}
