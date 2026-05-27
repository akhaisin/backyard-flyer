// Ladder path planner. Sits between the mission and fc_navigator.
//
// Two behaviours depending on stepKind:
//   waypoint — simple carrot: place a lookahead point along the straight line to the target.
//   gate     — pre-staging: first aim at ENTRY_DIST in front of the gate (approach side),
//              latch "preGateDone" when close, then aim at gate center. Same anti-oscillation
//              flag as quad-w1b.
//
// Yaw setpoint strategy — two key decisions:
//
//   Gate steps:  yaw = atan2(normal.z, normal.x)  — fixed per gate, equals travel direction.
//     NOT derived from drone-to-carrot. A carrot-based yaw near the gate would flip 180°
//     the moment the drone oscillates past the center, driving an instant reversal through
//     the body-frame decomposition in fc_navigator and causing a divergent spin.
//
//   Waypoint steps: yaw tracks atan2 to the target, but is RATE-LIMITED to MAX_YAW_RATE.
//     Without rate limiting, PID position oscillation can flip the direction-to-target by
//     ~180° in a single tick near the staging point, producing the same violent coupling.

type Vec3 = { x: number; y: number; z: number };

type PlannerIn = {
  pos: Vec3;
  target: Vec3;
  targetNormal: Vec3;
  stepKind: number;   // 0=waypoint, 1=gate
  stepIdx: number;
  armed: number;
  phase: number;
  preGateDone: number;
  activeStepIdx: number;
  yawSetpoint: number;   // previous setpoint — kept when carrot is overhead
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  preGateDone: number;
  activeStepIdx: number;
};

const LOOKAHEAD       = 3.0;   // metres
const ENTRY_DIST      = 5.0;   // metres in front of gate for pre-staging point
const PREGATE_THRESH  = 1.5;   // metres — triggers preGateDone latch
const NAVIGATE        = 2;
const STEP_GATE       = 1;

const MAX_YAW_RATE  = Math.PI / 2;   // rad/s — 90 °/s ceiling (gentler post-gate arcs)
const DT            = 0.05;
const MAX_YAW_DELTA = MAX_YAW_RATE * DT;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function carrotAlong(pos: Vec3, target: Vec3): Vec3 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= LOOKAHEAD) return target;
  const t = LOOKAHEAD / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

// Rate-limited shortest-path yaw update.
function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

function yawForStep(state: PlannerIn): number {
  if (Math.round(state.stepKind) === STEP_GATE) {
    // Travel direction = gate normal. Fixed for the whole gate step — no positional dependency.
    return stepYaw(Math.atan2(state.targetNormal.z, state.targetNormal.x), state.yawSetpoint);
  }
  // Waypoint: face the target (not the carrot — carrot can point backward when near target).
  const dx = state.target.x - state.pos.x;
  const dz = state.target.z - state.pos.z;
  if (Math.sqrt(dx * dx + dz * dz) < 0.5) return state.yawSetpoint;
  return stepYaw(Math.atan2(dz, dx), state.yawSetpoint);
}

export function fc_path_planner(state: PlannerIn): PlannerOut {
  // Always advance yaw toward the current target direction, even outside NAVIGATE
  // (so the drone faces home during RTH and keeps a sensible heading on landing).
  const yawSetpoint = yawForStep(state);

  const idle: PlannerOut = {
    carrot: state.target, yawSetpoint,
    preGateDone: 0, activeStepIdx: Math.round(state.stepIdx),
  };

  if (!state.armed || Math.round(state.phase) !== NAVIGATE) return idle;

  if (Math.round(state.stepKind) !== STEP_GATE) {
    // Waypoint step: simple carrot, no pre-staging needed.
    const carrot = carrotAlong(state.pos, state.target);
    return { carrot, yawSetpoint, preGateDone: 0, activeStepIdx: Math.round(state.stepIdx) };
  }

  // Gate step: pre-staging with anti-oscillation latch.
  const sIdx = Math.round(state.stepIdx);
  const preGateDone   = sIdx !== Math.round(state.activeStepIdx) ? 0 : Math.round(state.preGateDone);
  const activeStepIdx = sIdx;

  // Pre-gate: ENTRY_DIST on the approach side (opposite to normal direction).
  const preGate: Vec3 = {
    x: state.target.x - ENTRY_DIST * state.targetNormal.x,
    y: state.target.y - ENTRY_DIST * state.targetNormal.y,
    z: state.target.z - ENTRY_DIST * state.targetNormal.z,
  };

  const done          = preGateDone === 1 || dist3(state.pos, preGate) <= PREGATE_THRESH ? 1 : 0;
  const finalTarget   = done === 1 ? state.target : preGate;
  const carrot        = carrotAlong(state.pos, finalTarget);

  return { carrot, yawSetpoint, preGateDone: done, activeStepIdx };
}
