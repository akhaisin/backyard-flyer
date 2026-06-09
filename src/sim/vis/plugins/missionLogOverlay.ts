// HTML overlay displaying a collapsible mission log — one entry per phase
// transition, with status icons and per-phase body text.
//
// Body rendering is driven by two handler maps:
//   phase handlers  — phase number → (step, K) → string[]
//   step handlers   — step type number → (step, K) → string[]
//
// The plugin ships defaults for PHASE_RTH (shows home coords) and STEP_TYPE_WP
// (shows pos + threshold). PHASE_NAVIGATE delegates to the step handler map.
// All other phases produce no body. Unknown step types fall back to a default
// handler that shows pos only.
//
// Vis files extend the defaults by passing handlers in opts:
//   missionLogOverlay(s => view(s).mission, {
//     handlers: {
//       step: { [STEP_TYPE_CTURN]: (step) => [`pos ...`, `ticks ${step.durationTicks}`] },
//     },
//   })
//
// PHASE_RESTART is special: instead of creating its own entry it marks the
// previous NAVIGATE entry's icon as ↺, then adds a fresh NAVIGATE entry when
// the phase returns to NAVIGATE.

import type { Scene, PerspectiveCamera } from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';
import {
  PHASE_NAVIGATE, PHASE_RTH, PHASE_RESTART,
} from '../../models/lib/quad/mission';
import { STEP_TYPE_WP } from '../../models/lib/quad/consts';

// ── Public types ──────────────────────────────────────────────────────────────

type Vec3 = { x: number; y: number; z: number };

/** All fields that any step bus variant can carry. Handlers receive this. */
export interface MissionLogStep {
  stepType?: number;
  pos: Vec3;
  // WP
  threshold?: number;
  // CTURN
  durationTicks?: number;
  waypoints?: Vec3[];
  // W1A / W1B
  normal?: Vec3;
  width?: number;
  height?: number;
  preStageDist?: number;
  // RATES
  duration?: number;
  // C1A
  dest?: Vec3;
  speed?: number;
  // universal
  timeout?: number;
}

export interface MissionLogState {
  phase: number;
  stepIdx: number;
  step: MissionLogStep;
}

/** Renders the body of a phase-level log entry. Receives the current step bus
 *  and static consts (K) so it can read home coords, limits, etc. */
export type PhaseBodyHandler = (step: MissionLogStep, K: ModelState) => string[];

/** Renders the body of a NAVIGATE entry for a specific step type. */
export type StepBodyHandler = (step: MissionLogStep, K: ModelState) => string[];

export interface MissionLogHandlers {
  /** Overrides/extends built-in phase body handlers. */
  phase?: Partial<Record<number, PhaseBodyHandler>>;
  /** Overrides/extends built-in step type body handlers. */
  step?: Partial<Record<number, StepBodyHandler>>;
  /** Fallback for step types not in the step handler map. Default shows pos. */
  defaultStep?: StepBodyHandler;
}

export interface MissionLogOverlayOptions {
  title?: string;            // header label, default 'Mission Log'
  initialCollapsed?: boolean; // default true
  stepsEntries?: number;     // max visible log entries, default 5
  handlers?: MissionLogHandlers;
  /** Override step-count used for completed-vs-failed detection on NAVIGATE→RTH.
   *  Needed when the model stores steps under a non-standard K key (e.g. c2a/c2b
   *  keeps interceptor steps at K.interceptor.steps, not K.steps). */
  getStepsCount?: (K: ModelState) => number;
}

// ── Internals ─────────────────────────────────────────────────────────────────

type EntryStatus = 'running' | 'completed' | 'failed' | 'restarting';

const STEP_TYPE_NAMES: Record<number, string> = {
  0: 'WP', 1: 'W1A', 2: 'W1B', 3: 'RATES', 4: 'CTURN', 5: 'C1A', 6: 'C2A',
};

interface LogEntry {
  phase: number;
  stepIdx: number;
  stepType: number;
  status: EntryStatus;
  bodyLines: string[];
}

const BG             = 'rgba(10, 10, 18, 0.88)';
const BORDER         = 'rgba(80, 100, 130, 0.7)';
const BORDER_DIM     = 'rgba(80, 100, 130, 0.25)';
const COL_HEADER     = 'rgba(200, 215, 230, 0.9)';
const COL_DIM        = 'rgba(140, 160, 175, 0.65)';
const COL_BODY       = 'rgba(130, 150, 165, 0.6)';
const COL_BODY_RUN   = 'rgba(160, 185, 200, 0.85)';
const COL_RUNNING    = '#50d2ff';
const COL_COMPLETED  = '#44dd66';
const COL_FAILED     = '#ff4444';
const COL_RESTARTING = '#ffaa44';

const PHASE_NAMES = [
  'ARMING', 'TAKEOFF', 'NAVIGATE', 'RTH', 'LAND', 'DISARMING', 'DONE', 'RESTART',
];

const ICON: Record<EntryStatus, string> = {
  running:    '◉',
  completed:  '✓',
  failed:     '✗',
  restarting: '↺',
};

const ICON_COLOR: Record<EntryStatus, string> = {
  running:    COL_RUNNING,
  completed:  COL_COMPLETED,
  failed:     COL_FAILED,
  restarting: COL_RESTARTING,
};

function f1(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '?';
}

function posStr(pos: Vec3): string {
  return `(${f1(pos.x)}, ${f1(pos.y)}, ${f1(pos.z)})`;
}

// ── Built-in default handlers ─────────────────────────────────────────────────

const DEFAULT_STEP_HANDLER: StepBodyHandler = (step) => [
  `pos ${posStr(step.pos)}`,
];

const DEFAULT_STEP_HANDLERS: Partial<Record<number, StepBodyHandler>> = {
  [STEP_TYPE_WP]: (step) => [
    `pos ${posStr(step.pos)}`,
    `thr ${f1(step.threshold ?? 0)} m`,
  ],
};

const DEFAULT_PHASE_HANDLERS: Partial<Record<number, PhaseBodyHandler>> = {
  [PHASE_RTH]: (_step, K) => {
    const hx = f1(typeof K.HOME_X === 'number' ? K.HOME_X : 0);
    const hz = f1(typeof K.HOME_Z === 'number' ? K.HOME_Z : 0);
    return [`HOME (${hx}, ${hz})`];
  },
};

// NAVIGATE is handled specially: it delegates to the step handler map rather
// than having a phase handler of its own.
function resolveBody(
  phase: number,
  step: MissionLogStep,
  K: ModelState,
  phaseHandlers: Record<number, PhaseBodyHandler>,
  stepHandlers:  Record<number, StepBodyHandler>,
  defaultStep:   StepBodyHandler,
): string[] {
  const phaseH = phaseHandlers[phase];
  if (phaseH) return phaseH(step, K);
  if (phase === PHASE_NAVIGATE) {
    const type = Math.round((step.stepType ?? 0) as number);
    return (stepHandlers[type] ?? defaultStep)(step, K);
  }
  return [];
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export function missionLogOverlay(
  getState: (state: ModelState) => MissionLogState,
  opts: MissionLogOverlayOptions = {},
): ScenePlugin {
  const { title = 'Mission Log', initialCollapsed = true, stepsEntries = 5, handlers, getStepsCount } = opts;

  // Resolve handler maps once at creation — they don't change per tick.
  const phaseHandlers = {
    ...DEFAULT_PHASE_HANDLERS,
    ...handlers?.phase,
  } as Record<number, PhaseBodyHandler>;
  const stepHandlers = {
    ...DEFAULT_STEP_HANDLERS,
    ...handlers?.step,
  } as Record<number, StepBodyHandler>;
  const defaultStep = handlers?.defaultStep ?? DEFAULT_STEP_HANDLER;

  let root:     HTMLDivElement | null = null;
  let headerEl: HTMLDivElement | null = null;
  let bodyEl:   HTMLDivElement | null = null;
  let collapsed = initialCollapsed;

  const entries: LogEntry[] = [];
  let prevPhase   = -1;
  let prevStepIdx = -1;

  function closeLastEntry(
    fromPhase: number, toPhase: number, fromStepIdx: number, totalSteps: number,
  ) {
    const last = entries[entries.length - 1];
    if (!last || last.status !== 'running') return;
    if (fromPhase === PHASE_NAVIGATE) {
      last.status =
        toPhase === PHASE_RESTART ? 'restarting' :
        toPhase === PHASE_RTH
          ? (fromStepIdx >= totalSteps - 1 ? 'completed' : 'failed')
          : 'completed';
    } else {
      last.status = 'completed';
    }
  }

  function renderEntries() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    const visible = entries.slice(-stepsEntries);
    for (const entry of visible) {
      const entryEl = document.createElement('div');
      Object.assign(entryEl.style, {
        padding:   '3px 8px',
        borderTop: `1px solid ${BORDER_DIM}`,
      } as Partial<CSSStyleDeclaration>);

      const headerLine = document.createElement('div');
      Object.assign(headerLine.style, {
        display:    'flex',
        alignItems: 'center',
        gap:        '5px',
        fontSize:   '11px',
      } as Partial<CSSStyleDeclaration>);

      const iconEl = document.createElement('span');
      iconEl.textContent = ICON[entry.status];
      iconEl.style.color = ICON_COLOR[entry.status];

      const nameEl = document.createElement('span');
      nameEl.textContent = entry.phase === PHASE_NAVIGATE
        ? `NAVIGATE [${STEP_TYPE_NAMES[entry.stepType] ?? `TYPE_${entry.stepType}`}: #${entry.stepIdx}]`
        : PHASE_NAMES[entry.phase] ?? `PHASE_${entry.phase}`;
      nameEl.style.color = entry.status === 'running' ? COL_HEADER : COL_DIM;

      headerLine.appendChild(iconEl);
      headerLine.appendChild(nameEl);
      entryEl.appendChild(headerLine);

      for (const line of entry.bodyLines) {
        const lineEl = document.createElement('div');
        lineEl.textContent = line;
        Object.assign(lineEl.style, {
          paddingLeft: '16px',
          fontSize:    '10px',
          lineHeight:  '1.4',
          color:       entry.status === 'running' ? COL_BODY_RUN : COL_BODY,
        } as Partial<CSSStyleDeclaration>);
        entryEl.appendChild(lineEl);
      }

      bodyEl.appendChild(entryEl);
    }
  }

  return {
    init(_scene: Scene, _camera: PerspectiveCamera, container: HTMLElement) {
      if (!container.style.position) container.style.position = 'relative';

      root = document.createElement('div');
      Object.assign(root.style, {
        position:      'absolute',
        alignSelf:     'stretch',    // fills full width when inside a cornerGroup
        boxSizing:     'border-box',
        margin:        '0 5px',
        pointerEvents: 'auto',
        fontFamily:    'monospace',
        background:    BG,
        border:        `1px solid ${BORDER}`,
        borderRadius:  '4px',
        minWidth:      '160px',
        maxWidth:      '240px',
        overflow:      'hidden',
        userSelect:    'none',
        zIndex:        '5',
      } as Partial<CSSStyleDeclaration>);

      headerEl = document.createElement('div');
      headerEl.textContent = collapsed ? `▼ ${title}` : `▲ ${title}`;
      Object.assign(headerEl.style, {
        padding:      '5px 8px',
        cursor:       'pointer',
        borderBottom: `1px solid ${BORDER}`,
        fontSize:     '11px',
        fontWeight:   'bold',
        color:        COL_HEADER,
      } as Partial<CSSStyleDeclaration>);
      headerEl.addEventListener('click', () => {
        collapsed = !collapsed;
        headerEl!.textContent = collapsed ? `▼ ${title}` : `▲ ${title}`;
        if (bodyEl) bodyEl.style.display = collapsed ? 'none' : 'block';
      });
      root.appendChild(headerEl);

      bodyEl = document.createElement('div');
      if (collapsed) bodyEl.style.display = 'none';
      root.appendChild(bodyEl);
      container.appendChild(root);
      renderEntries();
    },

    update(state, _tick, _history, staticState) {
      const ms      = getState(state);
      const phase   = Math.round(ms.phase);
      const stepIdx = Math.round(ms.stepIdx);

      const isTransition =
        phase !== prevPhase ||
        (phase === PHASE_NAVIGATE && stepIdx !== prevStepIdx);
      if (!isTransition) return;

      const K = (staticState.K ?? {}) as ModelState;
      const totalSteps = getStepsCount
        ? getStepsCount(K)
        : Array.isArray(K.steps) ? (K.steps as unknown[]).length : 8;

      if (prevPhase >= 0 && prevPhase !== PHASE_RESTART) {
        closeLastEntry(prevPhase, phase, prevStepIdx, totalSteps);
      }

      // RESTART modifies the previous entry's icon rather than adding its own.
      if (phase !== PHASE_RESTART) {
        const stepType = Math.round((ms.step.stepType ?? 0) as number);
        entries.push({
          phase,
          stepIdx,
          stepType,
          status:    'running',
          bodyLines: resolveBody(phase, ms.step, K, phaseHandlers, stepHandlers, defaultStep),
        });
      }

      prevPhase   = phase;
      prevStepIdx = stepIdx;
      renderEntries();
    },

    dispose(_scene: Scene) {
      root?.remove();
      root      = null;
      headerEl  = null;
      bodyEl    = null;
      entries.length = 0;
      prevPhase   = -1;
      prevStepIdx = -1;
    },
  };
}
