// The w1a gate course — model-specific route data, shared between the config
// (published into state.K.steps via the lifecycle block) and the vis (rendered
// as window frames by the windowGate plugin).
//
// Window steps: `pos` is the gate center, `normal` the unit travel direction
// through the gate, `width`/`height` the frame size. No `threshold` — windows
// complete on a through-the-frame crossing (planner_w1a), not proximity.

import { STEP_TYPE_W1A } from '../../lib/quad/consts';
import type { W1aStep } from '../../lib/quad/consts';

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 5;

// 4 gates forming a rectangle; each normal points in the intended travel
// direction through that gate.
export const W1A_ROUTE: W1aStep[] = [
  { type: STEP_TYPE_W1A, pos: { x:  10, y: CRUISE_ALT, z: -10 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x:  10, y: CRUISE_ALT, z:  10 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x: -10, y: CRUISE_ALT, z:  10 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
  { type: STEP_TYPE_W1A, pos: { x: -10, y: CRUISE_ALT, z: -10 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE },
];
