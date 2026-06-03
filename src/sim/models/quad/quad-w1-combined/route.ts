// The combined A-vs-B race courses — two offset gate rectangles flown in
// parallel so the carrot (w1a) and pre-stage (w1b) planners can be compared
// side by side. Each track's HOME sits at its rectangle center; the lib mission
// reads HOME from K (HOME_X/HOME_Z), injected per-vehicle by the config.
//
// Track A (blue, carrot): STEP_TYPE_W1A gates — planner_w1a.
// Track B (orange, pre-stage): STEP_TYPE_W1B gates — planner_w1b stages before each gate.
//
// Shared by the lifecycle (→ K.stepsA/stepsB) and the vis (→ windowGate frames).

import { STEP_TYPE_W1A, STEP_TYPE_W1B } from '../../lib/quad/consts';
import type { W1aStep, W1bStep } from '../../lib/quad/consts';

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 4;
const PRE_STAGE   = 5;

// Track A — centered at (-15, 15).
export const HOME_A = { x: -15, z: 15 };
export const W1COMB_A_ROUTE: W1aStep[] = [
  { type: STEP_TYPE_W1A, pos: { x:  -7, y: CRUISE_ALT, z:   7 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x:  -7, y: CRUISE_ALT, z:  23 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x: -23, y: CRUISE_ALT, z:  23 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x: -23, y: CRUISE_ALT, z:   7 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
];

// Track B — centered at (15, -15), pre-stage active.
export const HOME_B = { x: 15, z: -15 };
export const W1COMB_B_ROUTE: W1bStep[] = [
  { type: STEP_TYPE_W1B, pos: { x: 23, y: CRUISE_ALT, z: -23 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { type: STEP_TYPE_W1B, pos: { x: 23, y: CRUISE_ALT, z:  -7 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { type: STEP_TYPE_W1B, pos: { x:  7, y: CRUISE_ALT, z:  -7 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { type: STEP_TYPE_W1B, pos: { x:  7, y: CRUISE_ALT, z: -23 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
];
