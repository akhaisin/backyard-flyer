// The w1b gate course — same rectangle of 4 gates as w1a, but each window step
// carries a `preStageDist`: planner_w1b first flies to a pre-stage waypoint that
// far behind the gate (along the inverse normal) so the quad lines up with the
// approach axis before committing to the frame.
//
// Shared between the config (published into state.K.steps via the lifecycle
// block) and the vis (rendered as window frames by the windowGate plugin).

import type { StepDef } from '../../lib/quad/consts';

const CRUISE_ALT  = 5;
const WINDOW_SIZE = 5;
const PRE_STAGE   = 5;   // metres in front of each gate (along -normal) to stage at

export const W1B_ROUTE: StepDef[] = [
  { pos: { x:  10, y: CRUISE_ALT, z: -10 }, normal: { x:  1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { pos: { x:  10, y: CRUISE_ALT, z:  10 }, normal: { x:  0, y: 0, z:  1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { pos: { x: -10, y: CRUISE_ALT, z:  10 }, normal: { x: -1, y: 0, z:  0 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
  { pos: { x: -10, y: CRUISE_ALT, z: -10 }, normal: { x:  0, y: 0, z: -1 }, width: WINDOW_SIZE, height: WINDOW_SIZE, preStageDist: PRE_STAGE },
];
