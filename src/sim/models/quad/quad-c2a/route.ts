// quad-c2a route definitions.
//
// TARGET: a 10×10 m square shifted +10 along both X and Z axes from the c1
// family path, so the interceptor's home pad (origin) sits cleanly outside the
// target's circuit. The target follows four WP waypoints — each corner of the
// square — looping indefinitely via the normal mission DONE→ARMING restart.
//
// INTERCEPTOR: a single C2a step. The interceptor pre-stages at pos (10, 5, 5)
// — on the south edge of the target's square — then pursues the live target
// position.  One-step mission restriction means one intercept = STATUS_COMPLETED
// → RTH. Shift the pos toward a different corner to change staging geometry.

import { STEP_TYPE_WP, STEP_TYPE_C2A } from '../../lib/quad/consts';
import type { WpStep, C2aStep } from '../../lib/quad/consts';

const CRUISE_ALT = 5;

// Target's home pad — centre of its square.
export const TARGET_HOME = { x: 10, z: 10 };

// Interceptor's home pad — shifted -5 on X and Z so it starts outside the target's path.
export const INTERCEPTOR_HOME = { x: -5, z: -5 };

// Four corners of the shifted square (SE → NE → NW → SW, then back to SE).
export const C2A_TARGET_ROUTE: WpStep[] = [
  { type: STEP_TYPE_WP, pos: { x: 15, y: CRUISE_ALT, z:  5 }, threshold: 2.0 },
  { type: STEP_TYPE_WP, pos: { x: 15, y: CRUISE_ALT, z: 15 }, threshold: 2.0 },
  { type: STEP_TYPE_WP, pos: { x:  5, y: CRUISE_ALT, z: 15 }, threshold: 2.0 },
  { type: STEP_TYPE_WP, pos: { x:  5, y: CRUISE_ALT, z:  5 }, threshold: 2.0 },
];

// Interceptor pre-stages at the midpoint of the target's first leg then pursues.
export const C2A_INTERCEPTOR_STEP: C2aStep = {
  type:      STEP_TYPE_C2A,
  pos:       { x: 10, y: CRUISE_ALT, z: 5 },
  threshold: 1.5,
};
