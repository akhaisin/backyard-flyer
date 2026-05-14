import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

function createSecondaryRing(selector: string): void {
  const el = document.querySelector(selector);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.id = 'tour-secondary-ring';
  Object.assign(ring.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: '3px solid rgba(255,255,255,0.85)',
    borderRadius: '4px',
    zIndex: '100001',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  });
  document.body.appendChild(ring);
}

function removeSecondaryRing(): void {
  document.getElementById('tour-secondary-ring')?.remove();
}

export function startTour(): void {
  const d = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    steps: [
      {
        popover: {
          title: 'Welcome to Backyard Flyer',
          description:
            'An interactive textbook for learning quadcopter control fundamentals. You read the material, edit the actual control code, and watch the simulation respond in real time.',
        },
      },
      {
        element: '#tour-toc',
        popover: {
          title: 'Table of Contents',
          description:
            'Navigate between chapters here. Pages with a simulation model unlock the Source and Visualisation tabs.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#tour-tab-bar',
        popover: {
          title: 'Three views',
          description:
            '<strong>Chapter</strong> — read the material and interact with embedded simulations.<br><br><strong>Source</strong> — edit every block of the model\'s control software.<br><br><strong>Visualisation</strong> — run the full simulation with a 3D view, rewind slider, and live charts.',
          side: 'bottom',
          align: 'start',
        },
        onHighlightStarted: () => {
          window.location.hash = '#sim-demo/floater';
          createSecondaryRing('.chapter-content');
        },
        onDeselected: () => {
          removeSecondaryRing();
        },
      },
      {
        element: '.chapter-content',
        popover: {
          title: 'Chapter content',
          description:
            'Each chapter embeds live sim components inline — a code editor, a 3D visualisation, and charts. You can start a simulation right here without switching tabs.',
          side: 'left',
          align: 'start',
        },
      },
      {
        popover: {
          title: 'Edit, stage, run',
          description:
            'Open the <strong>Source</strong> tab to edit any block, press <kbd>Ctrl+Enter</kbd> to stage it, then hit <strong>Start</strong> in the Visualisation tab to apply and run. Staged changes survive page navigation.',
          doneBtnText: 'Start exploring',
        },
      },
    ],
  });

  d.drive();
}
