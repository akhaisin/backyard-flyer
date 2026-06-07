// planner_c1b — pre-staged direct-pursuit planner for the c1 chase family,
// variant b.
//
// Extends planner_c1a with a pre-stage leg: before committing to direct
// pursuit the quad first flies to a fixed point `preStageDist` metres along
// the target's trajectory from its spawn (pos → dest direction). Once within
// PREGATE_THRESHOLD of that point the `preGateDone` latch fires and the
// planner switches to the same direct-pursuit logic as planner_c1a.
//
// When preStageDist is 0 (or absent) this degrades to exactly planner_c1a.
//
// Pre-stage resets on every non-NAVIGATE phase (RESTART fly-back, takeoff,
// RTH) so each new attempt starts with a fresh staging run.
//
// Yaw:
//   • Pre-stage leg → face the pre-stage point.
//   • Pursuit leg   → face the target (same as planner_c1a).
//   • Non-navigate  → face the anchor (step.pos).

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold?: number; preStageDist?: number; dest?: Vec3 };

type PlannerIn = {
  pos:          Vec3;
  targetPos:    Vec3;
  targetPhase:  number;
  step:         Step;
  armed:        number;
  phase:        number;
  yawSetpoint:  number;
  preGateDone:  number; // 0 | 1 latch, resets on non-NAVIGATE
};

type PlannerOut = {
  carrot:      Vec3;
  yawSetpoint: number;
  stepStatus:  number;
  preGateDone: number;
};

const NAVIGATE          = 2;
const TARGET_LAPPED     = 2;
const PREGATE_THRESHOLD = 2.0; // m — close enough to the pre-stage point to latch

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_RESTART   = 3;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function faceTarget(pos: Vec3, target: Vec3, prev: number): number {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  return (dx * dx + dz * dz > 0.01) ? Math.atan2(-dz, dx) : prev;
}

export function planner_c1b(state: PlannerIn): PlannerOut {
  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;

  if (!navigating) {
    // Non-navigate phases: fly to anchor (step.pos = HOME during restart/takeoff),
    // face it, and reset the pre-stage latch for the next attempt.
    const ax = state.step.pos.x - state.pos.x;
    const az = state.step.pos.z - state.pos.z;
    const yaw = (ax * ax + az * az > 0.01) ? Math.atan2(-az, ax) : state.yawSetpoint;
    return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING, preGateDone: 0 };
  }

  const preStageDist = state.step.preStageDist ?? 0;
  let preGateDone    = Math.round(state.preGateDone);

  if (preStageDist > 0 && preGateDone === 0) {
    // Compute the pre-stage point: preStageDist along pos → dest.
    const dest = state.step.dest ?? state.step.pos;
    const pdx  = dest.x - state.step.pos.x;
    const pdy  = dest.y - state.step.pos.y;
    const pdz  = dest.z - state.step.pos.z;
    const pd   = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
    const s    = pd > 0 ? preStageDist / pd : 0;
    const preStagePos: Vec3 = {
      x: state.step.pos.x + pdx * s,
      y: state.step.pos.y + pdy * s,
      z: state.step.pos.z + pdz * s,
    };

    if (dist3(state.pos, preStagePos) <= PREGATE_THRESHOLD) {
      preGateDone = 1;
    } else {
      const yaw = faceTarget(state.pos, preStagePos, state.yawSetpoint);
      return { carrot: preStagePos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING, preGateDone: 0 };
    }
  }

  // Direct pursuit — identical to planner_c1a from here.
  const threshold   = state.step.threshold ?? 2.5;
  const d           = dist3(state.pos, state.targetPos);
  const targetPhase = Math.round(state.targetPhase);

  const dx = state.targetPos.x - state.pos.x;
  const dz = state.targetPos.z - state.pos.z;
  const yawSetpoint = (dx * dx + dz * dz > 0.01)
    ? Math.atan2(-dz, dx)
    : state.yawSetpoint;

  if (d < threshold) {
    return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_COMPLETED, preGateDone };
  }

  if (targetPhase === TARGET_LAPPED) {
    return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_RESTART, preGateDone };
  }

  return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_RUNNING, preGateDone };
}
