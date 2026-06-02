// planner_w1b — pre-stage gate planner. Same crossing check + centerline
// pure-pursuit final approach as planner_w1a, with one addition: each gate may
// carry a pre-stage distance (step.preStageDist, from the route). While set, the
// quad first flies to a pre-stage waypoint preStageDist behind the gate along the
// inverse normal, so it arrives aligned with the approach axis before committing
// to the gate — oblique entries don't build lateral momentum that throws it
// outside the frame.
//
// During PHASE_NAVIGATE:
//   • Pre-stage phase (preStageDist > 0 and not yet staged): steer a carrot at
//     the pre-stage point. `preGateDone` latches to 1 the first tick the quad is
//     within PREGATE_THRESHOLD of it (a latch, not a live test, so the target
//     doesn't snap back once the quad flies past the pre-gate).
//   • Final phase (staged, or preStageDist <= 0): pure-pursuit carrot on the gate
//     centerline, LOOKAHEAD ahead of the quad's projection — identical to
//     planner_w1a, so the forward pull never collapses at the frame.
//   • Plane crossing inside the frame → STATUS_COMPLETED; off-frame → STATUS_RESTART
//     (mission flies back to the start anchor via PHASE_RESTART and re-runs the
//     gate). On a restart the stage + side latches reset so the pre-stage repeats.
//
// preStageDist <= 0 degrades this block to exactly planner_w1a's behaviour.
//
// Outside NAVIGATE the carrot sits at the mission target (anchor / HOME / LAND)
// and faces it. Yaw chases the gate normal during the approach (stable target),
// the carrot line otherwise. Rate-limited + first-order smoothed (stepYaw).
//
// Persistent planner state: windowSide, activeStepIdx (reset on step advance),
// preGateDone (stage latch), yawSetpoint. Tunables (LOOKAHEAD, MAX_YAW_RATE,
// YAW_SLEW_LPF, DT) arrive via state.K. STATUS_* / NAVIGATE are the mission
// protocol and stay inline (this block is recompiled with imports stripped).

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; normal: Vec3; width: number; height: number; preStageDist: number };
type PlannerConsts = {
  LOOKAHEAD: number;
  MAX_YAW_RATE: number;
  YAW_SLEW_LPF: number;
  DT: number;
};

type PlannerIn = {
  pos: Vec3;
  step: Step;
  stepIdx: number;
  armed: number;
  phase: number;
  yawSetpoint: number;
  windowSide: number;     // -1 | 0 | 1, 0 = not yet sampled for current step
  activeStepIdx: number;  // step index windowSide was sampled for
  preGateDone: number;    // 0 | 1 — pre-stage waypoint reached for this step
  K: PlannerConsts;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
  windowSide: number;
  activeStepIdx: number;
  preGateDone: number;
};

const NAVIGATE          = 2;
// How close to the pre-stage point counts as "staged" and latches preGateDone.
const PREGATE_THRESHOLD = 1.5;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_RESTART   = 3;

// Slew the heading setpoint toward `target`, first-order smoothed by `lpf` and
// capped at `maxDelta` rad/tick (see planner_w1a for the rationale).
function stepYaw(target: number, prev: number, maxDelta: number, lpf: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const eased = lpf * diff;
  return prev + Math.max(-maxDelta, Math.min(maxDelta, eased));
}

// Signed distance from pos to the gate plane (positive = "exit" side of normal).
function sideScore(pos: Vec3, step: Step): number {
  return (pos.x - step.pos.x) * step.normal.x
       + (pos.y - step.pos.y) * step.normal.y
       + (pos.z - step.pos.z) * step.normal.z;
}

// Perpendicular (in-plane) distance from pos to the gate center.
function perpDist(pos: Vec3, step: Step): number {
  const score = sideScore(pos, step);
  const rx = (pos.x - step.pos.x) - score * step.normal.x;
  const ry = (pos.y - step.pos.y) - score * step.normal.y;
  const rz = (pos.z - step.pos.z) - score * step.normal.z;
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Point-seeking carrot for the pre-stage leg: `lookahead` metres toward a fixed
// target point, clamping to the target once within range.
function carrotAlong(pos: Vec3, target: Vec3, lookahead: number): Vec3 {
  const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= lookahead) return target;
  const t = lookahead / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

// Pure-pursuit carrot on the gate centerline, LOOKAHEAD ahead of the quad's
// projection (see planner_w1a.gateCarrot).
function gateCarrot(pos: Vec3, step: Step, lookahead: number): Vec3 {
  const s = sideScore(pos, step) + lookahead;
  return {
    x: step.pos.x + s * step.normal.x,
    y: step.pos.y + s * step.normal.y,
    z: step.pos.z + s * step.normal.z,
  };
}

// Yaw target facing pos→point (XZ heading), holding prev when nearly on top.
function faceTarget(pos: Vec3, target: Vec3, prev: number): number {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  return Math.sqrt(dx * dx + dz * dz) > 0.5 ? Math.atan2(-dz, dx) : prev;
}

export function planner_w1b(state: PlannerIn): PlannerOut {
  const K           = state.K;
  const maxYawDelta = K.MAX_YAW_RATE * K.DT;
  const navigating  = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepIdx     = Math.round(state.stepIdx);
  const center      = state.step.pos;

  // Outside NAVIGATE (incl. PHASE_RESTART's fly-back): carrot at the mission
  // target, face it, clear the gate + stage latches so the resumed approach (and
  // its pre-stage) re-runs fresh.
  if (!navigating) {
    return {
      carrot:        center,
      yawSetpoint:   stepYaw(faceTarget(state.pos, center, state.yawSetpoint), state.yawSetpoint, maxYawDelta, K.YAW_SLEW_LPF),
      stepStatus:    STATUS_RUNNING,
      windowSide:    0,
      activeStepIdx: stepIdx,
      preGateDone:   0,
    };
  }

  // Reset gate + stage latches when mission advanced to a new step.
  const newStep    = stepIdx !== Math.round(state.activeStepIdx);
  const prevSide   = newStep ? 0 : Math.round(state.windowSide);
  let   preGateDone = newStep ? 0 : Math.round(state.preGateDone);

  // Pre-stage point: preStageDist behind the gate along the inverse normal.
  const usePreStage = state.step.preStageDist > 0;
  const preStage: Vec3 = {
    x: center.x - state.step.preStageDist * state.step.normal.x,
    y: center.y - state.step.preStageDist * state.step.normal.y,
    z: center.z - state.step.preStageDist * state.step.normal.z,
  };
  if (usePreStage && preGateDone === 0 && dist3(state.pos, preStage) <= PREGATE_THRESHOLD) {
    preGateDone = 1;
  }

  // ── Face the gate normal (stable target) ──
  const yawTarget   = Math.atan2(-state.step.normal.z, state.step.normal.x);
  const yawSetpoint = stepYaw(yawTarget, state.yawSetpoint, maxYawDelta, K.YAW_SLEW_LPF);

  // Pre-stage leg seeks the pre-stage point; afterwards the centerline carrot.
  const staging = usePreStage && preGateDone === 0;
  const carrot  = staging
    ? carrotAlong(state.pos, preStage, K.LOOKAHEAD)
    : gateCarrot(state.pos, state.step, K.LOOKAHEAD);

  const score       = sideScore(state.pos, state.step);
  const currentSide = score > 0 ? 1 : -1;

  // First tick on this step: record side, no crossing decision yet.
  if (prevSide === 0) {
    return {
      carrot,
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    currentSide,
      activeStepIdx: stepIdx,
      preGateDone,
    };
  }

  // Only approach→exit (-1 → +1) counts; the reverse is the drone retreating.
  const planeCrossed = prevSide === -1 && currentSide === 1;
  if (planeCrossed) {
    const withinFrame = perpDist(state.pos, state.step)
      < Math.max(state.step.width, state.step.height) / 2;
    if (withinFrame) {
      return {
        carrot:        center,
        yawSetpoint,
        stepStatus:    STATUS_COMPLETED,
        windowSide:    currentSide,
        activeStepIdx: stepIdx,
        preGateDone,
      };
    }
    // Missed the frame — report the miss. Mission takes over (PHASE_RESTART),
    // flying back to the start anchor; clear the gate + stage latches so the
    // re-run stages again.
    return {
      carrot:        center,
      yawSetpoint,
      stepStatus:    STATUS_RESTART,
      windowSide:    0,
      activeStepIdx: stepIdx,
      preGateDone:   0,
    };
  }

  return {
    carrot,
    yawSetpoint,
    stepStatus:    STATUS_RUNNING,
    windowSide:    currentSide,
    activeStepIdx: stepIdx,
    preGateDone,
  };
}
