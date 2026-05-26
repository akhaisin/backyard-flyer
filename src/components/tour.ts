import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function startTour(): void {
  const d = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    steps: [
      // --- Welcome ---
      {
        popover: {
          title: 'Welcome to Backyard Flyer',
          description:
            'An interactive textbook for learning quadcopter control fundamentals. You read the material, edit the actual control code, and watch the simulation respond in real time.',
        },
      },

      // --- TOC ---
      {
        element: '#tour-toc',
        popover: {
          title: 'Table of Contents',
          description:
            'Navigate between chapters here. Pages with a simulation model unlock the Source, Blocks, and Visualization tabs.',
          side: 'right',
          align: 'start',
        },
      },

      // --- Chapter tab ---
      {
        element: '#tour-tab-bar button:nth-child(1)',
        popover: {
          title: 'Chapter tab',
          description:
            'The reading view. Each chapter explains one concept and embeds live simulation components inline — a code editor, a 3D view, and charts — so you can experiment without leaving the page.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => {
          window.location.hash = '#Backyard-Flyer/quad-l2';
        },
      },

      // --- Source tab ---
      {
        element: '#tour-tab-bar button:nth-child(2)',
        popover: {
          title: 'Source tab',
          description:
            'Every block of the model\'s control software in one place. Edit any function directly in the browser, press <kbd>Ctrl+Enter</kbd> to stage it, then run the simulation to see the effect.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => {
          window.location.hash = '#Backyard-Flyer/quad-l2?view=src';
        },
      },

      // --- Blocks tab ---
      {
        element: '#tour-tab-bar button:nth-child(3)',
        popover: {
          title: 'Blocks tab',
          description:
            'A diagram of all blocks in the model and the signals flowing between them. Click any node to highlight the edges connected to it.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => {
          window.location.hash = '#Backyard-Flyer/quad-l2?view=blocks';
        },
      },

      // --- Visualization tab ---
      {
        element: '#tour-tab-bar button:nth-child(4)',
        popover: {
          title: 'Visualization tab',
          description:
            'The full simulation: a 3D view, a rewind slider, and live charts in the panel below. Staged source edits take effect here when you press <strong>Start</strong>.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => {
          window.location.hash = '#Backyard-Flyer/quad-l2?view=vis';
        },
      },

      // --- Done ---
      {
        popover: {
          title: 'Ready to fly',
          description:
            'Start from the <strong>Backyard Flyer</strong> chapter and work through the models in order. Each one adds one layer of realism over the previous.',
          doneBtnText: 'Start exploring',
        },
        onHighlightStarted: () => {
          window.location.hash = '#Backyard-Flyer/quad-l2';
        },
      },
    ],
  });

  d.drive();
}
