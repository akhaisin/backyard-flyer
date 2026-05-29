// Waypoint planner. Active when missionType === MISSION_WP.
//
// Produces a lookahead carrot along the line to the current target, plus a
// rate-limited yaw setpoint facing the target. navigator_wp consumes both.
//
// When the active mission type is something else (e.g. MISSION_3DTURN), this
// block short-circuits: carrot = current pos, yaw setpoint unchanged. That
// prevents integral wind-up and keeps the visual overlay sane.

type Vec3 = { x: number; y: number; z: number };

type PlannerIn = {
  pos: Vec3;
  target: Vec3;
  missionType: number;
  armed: number;
  phase: number;
  yawSetpoint: number;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
};

const LOOKAHEAD     = 3.0;
const NAVIGATE      = 2;
const MISSION_WP    = 0;

const MAX_YAW_RATE  = Math.PI / 2;
const DT            = 0.05;
const MAX_YAW_DELTA = MAX_YAW_RATE * DT;

function carrotAlong(pos: Vec3, target: Vec3): Vec3 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= LOOKAHEAD) return target;
  const t = LOOKAHEAD / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

export function planner_wp(state: PlannerIn): PlannerOut {
  if (Math.round(state.missionType) !== MISSION_WP) {
    return { carrot: state.pos, yawSetpoint: state.yawSetpoint };
  }

  let yawSetpoint = state.yawSetpoint;
  const dx = state.target.x - state.pos.x;
  const dz = state.target.z - state.pos.z;
  if (Math.sqrt(dx * dx + dz * dz) >= 0.5) {
    yawSetpoint = stepYaw(Math.atan2(dz, dx), state.yawSetpoint);
  }

  if (!state.armed || Math.round(state.phase) !== NAVIGATE) {
    return { carrot: state.target, yawSetpoint };
  }

  return { carrot: carrotAlong(state.pos, state.target), yawSetpoint };
}
