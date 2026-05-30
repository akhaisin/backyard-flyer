// Waypoint planner + completion checker. Active when missionType === MISSION_WP.
//
// Produces a lookahead carrot along the line to step.pos, plus a rate-limited
// yaw setpoint facing the target. Reports stepStatus to mission each tick:
//   STATUS_COMPLETED when active in NAVIGATE and within step.threshold,
//   STATUS_RUNNING   otherwise.
//
// When the active mission type is something else (e.g. MISSION_CTURN) this
// block short-circuits: carrot = current pos, yaw setpoint unchanged,
// stepStatus = RUNNING. That prevents integral wind-up, keeps the visual
// overlay sane, and makes mission ignore wp status during the cturn segment.

type Vec3 = { x: number; y: number; z: number };

// Projection of the active step on the bus. Only wp-relevant fields are read
// here; cturn-only fields are also present (zeroed-out by mission) but ignored.
// Gating is by missionType, so no `type` discriminator is needed.
type Step = { pos: Vec3; threshold: number };

type PlannerIn = {
  pos: Vec3;
  step: Step;
  missionType: number;
  armed: number;
  phase: number;
  yawSetpoint: number;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
};

const LOOKAHEAD  = 3.0;
const NAVIGATE   = 2;
const MISSION_WP = 0;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

const MAX_YAW_RATE  = Math.PI / 2;
const DT            = 0.05;
const MAX_YAW_DELTA = MAX_YAW_RATE * DT;

// Freeze the yaw setpoint when within this distance of the target. atan2(dz, dx)
// becomes pathologically sensitive as the position-error vector shrinks: a 5 cm
// overshoot at 50 cm range = ~6° yaw swing; the same overshoot at 5 cm range =
// ~90°+. Combined with the cascade's underdamped yaw response (zeta ≈ 0.12 with
// current fc_acro gains), the drone overshoots wildly trying to chase a target
// that's already moot. 2.0 m gives the cascade time to settle on the approach
// heading before threshold effects kick in.
const YAW_FREEZE_RANGE = 2.0;

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

// Private: 3D Euclidean threshold check. Only the wp planner uses this — kept
// inline rather than a separate step_checker_wp block per refactor decision.
function step_complete_check(pos: Vec3, step: Step): boolean {
  const dx = step.pos.x - pos.x;
  const dy = step.pos.y - pos.y;
  const dz = step.pos.z - pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < step.threshold;
}

export function planner_wp(state: PlannerIn): PlannerOut {
  const target = state.step.pos;

  if (Math.round(state.missionType) !== MISSION_WP) {
    return { carrot: state.pos, yawSetpoint: state.yawSetpoint, stepStatus: STATUS_RUNNING };
  }

  let yawSetpoint = state.yawSetpoint;
  const dx = target.x - state.pos.x;
  const dz = target.z - state.pos.z;
  if (Math.sqrt(dx * dx + dz * dz) >= YAW_FREEZE_RANGE) {
    yawSetpoint = stepYaw(Math.atan2(dz, dx), state.yawSetpoint);
  }

  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepStatus = navigating && step_complete_check(state.pos, state.step)
    ? STATUS_COMPLETED
    : STATUS_RUNNING;

  if (!navigating) {
    return { carrot: target, yawSetpoint, stepStatus };
  }

  return { carrot: carrotAlong(state.pos, target), yawSetpoint, stepStatus };
}
