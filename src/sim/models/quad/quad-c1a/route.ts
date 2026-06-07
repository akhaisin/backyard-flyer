// Quad-c1a chase course — four sides of a 10 × 10 m square in the XZ plane
// at cruise altitude, traversed clockwise when viewed from above.
//
// Each step: target spawns at `pos`, moves to `dest` at `speed` m/s.
// Quad must close to within `threshold` metres before the target arrives.
//
// Square corners: (±5, CRUISE_ALT, ±5) — side length 10 m.
// Target speed ≈ 4 m/s, so each 10 m leg takes 2.5 s (50 ticks at 20 Hz).

import { STEP_TYPE_C1A } from '../../lib/quad/consts';
import type { C1aStep } from '../../lib/quad/consts';

const CRUISE_ALT = 5;
const TARGET_SPEED = 2;   // m/s — half-speed for direct pursuit to reliably catch up
const THRESHOLD = 1.0;    // intercept radius (m)

export const C1A_ROUTE: C1aStep[] = [
  // East side — target moves south → north (+Z direction)
  { type: STEP_TYPE_C1A, pos: { x: 5, y: CRUISE_ALT, z: -5 }, dest: { x: 5, y: CRUISE_ALT, z: 5 }, speed: TARGET_SPEED, threshold: THRESHOLD },
  // North side — target moves east → west (-X direction)
  { type: STEP_TYPE_C1A, pos: { x: 5, y: CRUISE_ALT, z: 5 }, dest: { x: -5, y: CRUISE_ALT, z: 5 }, speed: TARGET_SPEED, threshold: THRESHOLD },
  // West side — target moves north → south (-Z direction)
  { type: STEP_TYPE_C1A, pos: { x: -5, y: CRUISE_ALT, z: 5 }, dest: { x: -5, y: CRUISE_ALT, z: -5 }, speed: TARGET_SPEED, threshold: THRESHOLD },
  // South side — target moves west → east (+X direction)
  { type: STEP_TYPE_C1A, pos: { x: -5, y: CRUISE_ALT, z: -5 }, dest: { x: 5, y: CRUISE_ALT, z: -5 }, speed: TARGET_SPEED, threshold: THRESHOLD },
];
