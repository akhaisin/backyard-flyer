// Quad-c1b chase course — same four-sided 10 × 10 m square as c1a, but each
// step carries a preStageDist so planner_c1b first positions the quad at the
// midpoint of the target's segment before committing to direct pursuit.

import { STEP_TYPE_C1A } from '../../lib/quad/consts';
import type { C1aStep } from '../../lib/quad/consts';

const CRUISE_ALT    = 5;
const TARGET_SPEED  = 2;    // m/s
const THRESHOLD     = 1.0;  // intercept radius (m) — tighter than c1a
const PRESTAGE_DIST = 3.0;  // m along pos→dest before switching to pursuit

export const C1B_ROUTE: C1aStep[] = [
  // East side
  { type: STEP_TYPE_C1A, pos: { x: 5, y: CRUISE_ALT, z: -5 }, dest: { x: 5, y: CRUISE_ALT, z:  5 }, speed: TARGET_SPEED, threshold: THRESHOLD, preStageDist: PRESTAGE_DIST },
  // North side
  { type: STEP_TYPE_C1A, pos: { x: 5, y: CRUISE_ALT, z:  5 }, dest: { x: -5, y: CRUISE_ALT, z:  5 }, speed: TARGET_SPEED, threshold: THRESHOLD, preStageDist: PRESTAGE_DIST },
  // West side
  { type: STEP_TYPE_C1A, pos: { x: -5, y: CRUISE_ALT, z:  5 }, dest: { x: -5, y: CRUISE_ALT, z: -5 }, speed: TARGET_SPEED, threshold: THRESHOLD, preStageDist: PRESTAGE_DIST },
  // South side
  { type: STEP_TYPE_C1A, pos: { x: -5, y: CRUISE_ALT, z: -5 }, dest: { x:  5, y: CRUISE_ALT, z: -5 }, speed: TARGET_SPEED, threshold: THRESHOLD, preStageDist: PRESTAGE_DIST },
];
