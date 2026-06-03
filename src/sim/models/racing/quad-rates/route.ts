// The quad-rates maneuver — model-specific route data, shared between the
// config (published into state.K.steps via the lifecycle block) and any vis
// that renders waypoints.
//
// Rates steps: `pos` is the expected world-space destination after the step
// finishes (used by waypoint vis / cross-track strip). Completion is
// time-based (planner_rates), not proximity — `duration` drives sequencing.
//
// Flying convention (fc_acro contract):
//   pitch < 0  → nose down → forward acceleration
//   yaw   > 0  → yaw right (clockwise from above)
//   roll  > 0  → roll right

import { STEP_TYPE_RATES } from '../../lib/quad/consts';
import type { RatesStep } from '../../lib/quad/consts';

const CRUISE_ALT     = 5;
const THROTTLE_HOVER = 0.235;

// Three steps: hover → yaw 180° right → hover → auto-RTH.
export const QUAD_RATES_ROUTE: RatesStep[] = [
  // ── hover ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 40,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: 0, end: 0 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
  // ── pitch forward for moving ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 20,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: -0.1, end: -0.1 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
  // ── pitch back for breaking ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 20,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: 0.1, end: 0.1 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
  // ── yaw 180° right ────────────────────────────────────────────────────
  // 0.25 × 2π × 40 ticks × 0.05 s/tick = π rad = 180°
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 40,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: 0, end: 0 },
    yaw:      { start: 0.25, end: 0.25 },
    roll:     { start: 0, end: 0 },
  },
    // ── pitch forward for moving ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 20,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: -0.05, end: -0.05 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
  // ── pitch back for breaking ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 20,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: -0.05, end: -0.05 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
  // ── hover ─────────────────────────────────────────────────────────────
  {
    type: STEP_TYPE_RATES,
    pos:      { x: 0, y: CRUISE_ALT, z: 0 },
    duration: 40,
    throttle: { start: THROTTLE_HOVER, end: THROTTLE_HOVER },
    pitch:    { start: 0, end: 0 },
    yaw:      { start: 0, end: 0 },
    roll:     { start: 0, end: 0 },
  },
];
