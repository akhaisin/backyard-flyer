// The quad-pole circuit: takeoff → staging → arc entry → coordinated turn → RTH.
//
// POLE sits at world (8, 0, 0). The cturn waypoints define a ~3 m radius arc
// in the xz plane at CRUISE_ALT. planner_cturn fits the circle, then derives
// bank angle + yaw rate for a coordinated horizontal turn.
//
// The WP_ENTRY step brings the drone to the first cturn waypoint before the
// maneuver starts so the drone is on the orbit when planner_cturn takes over.

import { STEP_TYPE_WP, STEP_TYPE_CTURN } from '../../lib/quad/consts';
import type { Vec3, StepDef } from '../../lib/quad/consts';

export const POLE: Vec3       = { x: 8, y: 0, z: 0 };
export const POLE_HEIGHT      = 5;

const CRUISE_ALT = 3;
const STAGING: Vec3   = { x: 4, y: CRUISE_ALT, z:    0 };
const WP_ENTRY: Vec3  = { x: 8, y: CRUISE_ALT, z: -3.0 };  // first cturn waypoint

export const QUAD_POLE_ROUTE: StepDef[] = [
  {
    type: STEP_TYPE_WP,
    pos:       STAGING,
    threshold: 0.4,
  },
  {
    type: STEP_TYPE_WP,
    pos:       WP_ENTRY,
    threshold: 0.5,
  },
  {
    type:          STEP_TYPE_CTURN,
    pos:           { x: 12, y: CRUISE_ALT, z:   0 },
    waypoints: [
      WP_ENTRY,
      { x: 12, y: CRUISE_ALT, z:   0 },
      { x:  8, y: CRUISE_ALT, z: 3.0 },
    ],
    durationTicks: 70,
  },
];
