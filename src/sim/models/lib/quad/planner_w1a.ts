// planner_w1a — carrot-and-stick path planner + window-crossing checker for the
// w1a gate course. The mission/planner split mirrors the shared lib waypoint
// stack (mission sequences steps, the planner decides completion) — w1a just
// swaps proximity completion for through-the-gate crossing detection.
//
// During PHASE_NAVIGATE this block owns the window-specific logic:
//   • Emit a pure-pursuit carrot on the gate's centerline (the line through the
//     gate center along step.normal), LOOKAHEAD metres ahead of the quad's
//     projection onto it. Crucially the carrot rides PAST the gate as the quad
//     nears it, so the forward pull never collapses to zero at the frame (a plain
//     "aim at the center point" carrot does, leaving the quad to coast off-centre
//     through the plane). The off-axis component steers the quad onto the
//     centerline, so it flies through the middle aligned with the normal.
//   • Detect a plane crossing (signed distance along step.normal flips -→+).
//   • Clean crossing inside the frame  → STATUS_COMPLETED (mission advances).
//   • Off-frame crossing (a miss)      → STATUS_RESTART. Mission then takes the
//     drone into PHASE_RESTART (fly back to the start anchor as a plain waypoint
//     and re-run the same gate); the fly-back trajectory is no longer this
//     block's concern. While mission is in PHASE_RESTART this block sees a
//     non-NAVIGATE phase and just steers the carrot at mission's target (the
//     anchor), clearing its gate side so the resumed approach re-samples fresh.
//   • Otherwise STATUS_RUNNING.
//
// Outside NAVIGATE the planner emits a carrot toward step.pos (mission points it
// at the anchor during RESTART, HOME / LAND_PAD otherwise) and faces that target.
//
// Yaw chases the gate normal during a normal approach (stable target) and the
// direct line to the carrot during non-navigate phases. Rate-limited.
//
// Persistent planner state: windowSide (signed-distance side last tick),
// activeStepIdx (resets windowSide when mission advances), and yawSetpoint.
//
// step.pos / segStart / segEnd ride the mission bus; gate geometry (normal,
// width, height) rides the same bus straight from the route. Tunables (LOOKAHEAD,
// MAX_YAW_RATE, YAW_SLEW_LPF, DT) arrive as data via state.K. STATUS_* / NAVIGATE
// are the mission protocol contract and stay inline (this block is recompiled
// with imports stripped, so nothing here may be imported).

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; normal: Vec3; width: number; height: number };
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
  K: PlannerConsts;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
  windowSide: number;
  activeStepIdx: number;
};

const NAVIGATE        = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_RESTART   = 3;

// Slew the heading setpoint toward `target`, first-order smoothed by `lpf` (each
// tick moves only that fraction of the way) and capped at `maxDelta` rad/tick.
// A moving target whose direction jitters tick-to-tick is attenuated rather than
// chased, while the slew cap still bounds genuine large turns (gate-to-gate).
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

// Pure-pursuit carrot on the gate centerline: the quad's projection onto the
// line through the gate center along step.normal, advanced LOOKAHEAD forward.
// `sideScore` is the signed along-normal distance, so center + (sideScore +
// LOOKAHEAD)·normal sits LOOKAHEAD ahead of the projection — past the gate as the
// quad approaches, keeping the forward pull alive. The pos→carrot vector also
// carries the off-axis offset, pulling the quad onto the centerline.
function gateCarrot(pos: Vec3, step: Step, lookahead: number): Vec3 {
  const s = sideScore(pos, step) + lookahead;
  return {
    x: step.pos.x + s * step.normal.x,
    y: step.pos.y + s * step.normal.y,
    z: step.pos.z + s * step.normal.z,
  };
}

// Yaw target that faces from pos toward a point (XZ heading), holding the last
// setpoint when nearly on top of it.
function faceTarget(pos: Vec3, target: Vec3, prev: number): number {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  return Math.sqrt(dx * dx + dz * dz) > 0.5 ? Math.atan2(-dz, dx) : prev;
}

export function planner_w1a(state: PlannerIn): PlannerOut {
  const K           = state.K;
  const maxYawDelta = K.MAX_YAW_RATE * K.DT;
  const navigating  = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepIdx     = Math.round(state.stepIdx);
  const center      = state.step.pos;

  // Outside NAVIGATE (incl. PHASE_RESTART's fly-back): carrot at the mission
  // target, face it, clear gate state so the resumed approach re-samples fresh.
  if (!navigating) {
    return {
      carrot:        center,
      yawSetpoint:   stepYaw(faceTarget(state.pos, center, state.yawSetpoint), state.yawSetpoint, maxYawDelta, K.YAW_SLEW_LPF),
      stepStatus:    STATUS_RUNNING,
      windowSide:    0,
      activeStepIdx: stepIdx,
    };
  }

  // Reset gate state when mission advanced to a new step.
  const newStep    = stepIdx !== Math.round(state.activeStepIdx);
  const prevSide   = newStep ? 0 : Math.round(state.windowSide);

  // ── Normal approach: face the gate normal (stable target) ──
  const yawTarget   = Math.atan2(-state.step.normal.z, state.step.normal.x);
  const yawSetpoint = stepYaw(yawTarget, state.yawSetpoint, maxYawDelta, K.YAW_SLEW_LPF);

  const score       = sideScore(state.pos, state.step);
  const currentSide = score > 0 ? 1 : -1;

  // First tick on this step: record side, no crossing decision yet.
  if (prevSide === 0) {
    return {
      carrot:        gateCarrot(state.pos, state.step, K.LOOKAHEAD),
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    currentSide,
      activeStepIdx: stepIdx,
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
      };
    }
    // Missed the frame — report the miss. Mission takes over (PHASE_RESTART),
    // flying the drone back to the start anchor; this block clears its gate side.
    return {
      carrot:        center,
      yawSetpoint,
      stepStatus:    STATUS_RESTART,
      windowSide:    0,
      activeStepIdx: stepIdx,
    };
  }

  return {
    carrot:        gateCarrot(state.pos, state.step, K.LOOKAHEAD),
    yawSetpoint,
    stepStatus:    STATUS_RUNNING,
    windowSide:    currentSide,
    activeStepIdx: stepIdx,
  };
}
