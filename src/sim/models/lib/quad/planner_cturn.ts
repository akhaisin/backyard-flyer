// Coordinated-turn planner + completion checker. Active when step.stepType === STEP_TYPE_CTURN.
//
// Fits a circular arc through the three step.waypoints in the xz plane, then
// derives the physical quantities of a coordinated horizontal turn:
//   v_eff = max(‖vel_xz‖, vNom/4)              effective speed (avoids zero-divide)
//   φ     = atan(accelIn / g)                   bank angle magnitude (rad), ≤ MAX_BANK
//   ω     = |accelIn| / v_eff                   yaw rate magnitude (rad/s)
// where accelIn = v_eff²/r + orbit-tracking feedback, clamped by g·tan(MAX_BANK).
// Deriving ω from φ (not from v/r directly) keeps the roll and yaw commands
// physically consistent: at MAX_BANK, ω = g·tan(MAX_BANK)/v, which prevents the
// yaw stick from saturating the motor mixing at high entry speeds.
//
// Then it adds orbit-tracking feedback from the current position / velocity:
//   • heading target = local tangent direction, tilted inward/outward by radial error
//   • bank magnitude = coordinated-turn baseline plus radial-error damping
// and translates those into AETR sticks for navigator_cturn → fc_acro:
//   roll   = closed-loop on attitude.x toward dirSign · φ_des
//   yaw    = yaw-rate command from nominal ω plus heading error correction
//   throttle = HOVER_THROTTLE / cos(φ)           (maintain vertical thrust)
//   pitch  = 0                                    (level turn; constant altitude)
//
// Sign convention: in this simulation attitude.y = -π/2 means "facing +z" (right).
// A CCW arc (dirSign=+1) turns right (toward +z), which requires attitude.y to
// DECREASE — i.e. a NEGATIVE yaw stick.  Hence yaw = −dirSign · ω / MAX_RATE_YAW.
//
// Reports STATUS_COMPLETED when the drone has swept within 0.1 rad of the exit angle.
// Returns idle (and STATUS_RUNNING) if not active, if waypoints aren't 3, if
// the waypoints are collinear, or if durationTicks ≤ 0.
//
// Debug mode (step.debug === 1): skip the arc and fly the three waypoints as two
// straight legs (w0→w1→w2). The planner only sequences the active leg target into
// targetX/Y/Z and sets debug=1; navigator_cturn does the straight-line flying.
// Use it to visually inspect a route's waypoint geometry without arc dynamics.

type Vec3 = { x: number; y: number; z: number };

// Projection of the active step on the bus. stepType gates whether this planner
// is active for the current step; cturn-specific fields are read when it is.
type Step = {
  pos: Vec3;
  stepType?: number;
  durationTicks: number;
  waypoints: Vec3[];
  debug?: number;        // 1 = straight-leg debug mode (see below)
};

type PlannerConsts = {
    DT: number;
    GRAVITY: number;
    MASS: number;
    MAX_THRUST_N: number;
    MAX_RATE_ROLL_PITCH: number;
    MAX_RATE_YAW: number;
    KP_POS: number;
    KD_POS: number;
};

type PlannerIn = {
  pos: Vec3;
  vel: Vec3;
  step: Step;
  ticksInPhase: number;
  armed: number;
  phase: number;
  attitude: Vec3;
  K: PlannerConsts;
};

type PlannerOut = {
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
  active: number;       // 1 when the maneuver is being executed this tick
  stepStatus: number;
  debug: number;        // 1 → navigator flies straight to (targetX,targetY,targetZ)
  targetX: number;      // active 3D target for navigator (leg/arc sampled point)
  targetY: number;
  targetZ: number;
  targetYaw: number;    // desired heading at target (rad)
};

const NAVIGATE       = 2;
const STEP_TYPE_CTURN = 4;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

// Outer P-gain for roll-attitude tracking. Effective cascade gain =
// KP_ROLL_OUTER × KP_RATE (fc_acro). Calibrated for lib KP_RATE = 0.2:
// 10 × 0.2 = 2.0 Nm/rad, matching the old 40 × 0.05 = 2.0 value.
const KP_ROLL_OUTER       = 10.0;
const KP_YAW_TRACK        = 2.0;
const ORBIT_GUIDE_GAIN    = 1.25;
const KP_RADIAL_ACCEL     = 1.5;
const KD_RADIAL_ACCEL     = 1.0;
const CTURN_TIMEOUT_FACTOR = 2.5;

// Safety clamp on bank — beyond ~60° the thrust compensation grows unbounded
// and the planner is operating outside any meaningful "coordinated" regime.
const MAX_BANK = Math.PI / 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >  Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

function norm2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// Fit a circle in the xz plane through 3 points. Returns null if the points
// are collinear (parallel chords). Closed-form via perpendicular-bisector
// intersection in the chord plane.
function fitCircleXZ(w0: Vec3, w1: Vec3, w2: Vec3):
  { cx: number; cz: number; r: number } | null {
  const ax = w1.x - w0.x, az = w1.z - w0.z;
  const bx = w2.x - w0.x, bz = w2.z - w0.z;
  const d = 2 * (ax * bz - az * bx);
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + az * az;
  const b2 = bx * bx + bz * bz;
  const ux = (bz * a2 - az * b2) / d;
  const uz = (ax * b2 - bx * a2) / d;
  return { cx: w0.x + ux, cz: w0.z + uz, r: Math.sqrt(ux * ux + uz * uz) };
}

// Signed total sweep angle from θ0 to θ2 along the arc that passes through θ1.
// Positive = CCW in atan2 sense (angle-increasing direction in xz plane).
function arcSweep(theta0: number, theta1: number, theta2: number): number {
  const TWO_PI = 2 * Math.PI;
  const dCcw = ((theta2 - theta0) % TWO_PI + TWO_PI) % TWO_PI;   // [0, 2π)
  const dCw  = dCcw - TWO_PI;                                     // (−2π, 0]
  const m    = ((theta1 - theta0) % TWO_PI + TWO_PI) % TWO_PI;    // [0, 2π)
  return m < dCcw ? dCcw : dCw;
}

export function planner_cturn(state: PlannerIn): PlannerOut {
  const idle: PlannerOut = {
    throttle: 0, roll: 0, pitch: 0, yaw: 0,
    active: 0, stepStatus: STATUS_RUNNING,
    debug: 0, targetX: 0, targetY: 0, targetZ: 0, targetYaw: 0,
  };

  if (!state.armed) return idle;
  if (Math.round(state.phase) !== NAVIGATE) return idle;
  if (Math.round(state.step.stepType ?? 0) !== STEP_TYPE_CTURN) return idle;

  const wps = state.step.waypoints;
  if (wps.length !== 3) return idle;
  if (state.step.durationTicks <= 0) return idle;

  // ── Debug mode ────────────────────────────────────────────────────────────
  // Skip the arc entirely and fly the three waypoints as two straight legs
  // (w0→w1, w1→w2). The planner only sequences the active leg target and reports
  // completion; navigator_cturn does the straight-line flying (active + debug).
  // Leg select is a stateless half-plane test: once the drone passes the plane
  // through w1 perpendicular to (w1−w0), switch the target from w1 to w2.
  if (Math.round(state.step.debug ?? 0) === 1) {
    const w0 = wps[0], w1 = wps[1], w2 = wps[2];
    const pastW1 =
      (state.pos.x - w1.x) * (w1.x - w0.x) +
      (state.pos.y - w1.y) * (w1.y - w0.y) +
      (state.pos.z - w1.z) * (w1.z - w0.z) >= 0;
    const target = pastW1 ? w2 : w1;

    // Complete on passing the w2 plane (perpendicular to w1→w2), arriving within
    // 1 m, or the durationTicks·3 safety timeout. The geometric checks are gated
    // on having finished leg 1 (pastW1): the entry approach can already sit on the
    // far side of the w2 plane (e.g. cturn #1 entered from WP_STAGING_BEFORE on the
    // −x side), which would otherwise fire completion on the first tick.
    const pastW2 =
      (state.pos.x - w2.x) * (w2.x - w1.x) +
      (state.pos.y - w2.y) * (w2.y - w1.y) +
      (state.pos.z - w2.z) * (w2.z - w1.z) >= 0;
    const dx = w2.x - state.pos.x, dy = w2.y - state.pos.y, dz = w2.z - state.pos.z;
    const nearW2 = dx * dx + dy * dy + dz * dz <= 1.0;
    const ticks = Math.round(state.ticksInPhase);
    const done = (pastW1 && (pastW2 || nearW2)) || ticks >= state.step.durationTicks * 3;

    return {
      throttle: 0, roll: 0, pitch: 0, yaw: 0,
      active: 1,
      stepStatus: done ? STATUS_COMPLETED : STATUS_RUNNING,
      debug: 1,
      targetX: target.x, targetY: target.y, targetZ: target.z,
      targetYaw: Math.atan2(-(target.z - state.pos.z), target.x - state.pos.x),
    };
  }

  const circle = fitCircleXZ(wps[0], wps[1], wps[2]);
  if (!circle) return idle;
  const { cx, cz, r } = circle;

  const theta0 = Math.atan2(wps[0].z - cz, wps[0].x - cx);
  const theta1 = Math.atan2(wps[1].z - cz, wps[1].x - cx);
  const theta2 = Math.atan2(wps[2].z - cz, wps[2].x - cx);
  const sweep  = arcSweep(theta0, theta1, theta2);    // rad, signed
  const dirSign = Math.sign(sweep);                    // +1 CCW, −1 CW
  if (dirSign === 0) return idle;

  const arcLen   = Math.abs(sweep) * r;
  const duration = state.step.durationTicks * state.K.DT;
  const vNom     = arcLen / duration;

  // Use actual horizontal speed for the centripetal-acceleration baseline.
  // Floor at vNom/4 to avoid division by zero when nearly stationary.
  const vH   = norm2(state.vel.x, state.vel.z);
  const vEff = Math.max(vH, vNom * 0.25);

  const relX = state.pos.x - cx;
  const relZ = state.pos.z - cz;
  const rho = norm2(relX, relZ);

  const fallbackX = wps[0].x - cx;
  const fallbackZ = wps[0].z - cz;
  const fallbackNorm = Math.max(norm2(fallbackX, fallbackZ), 1e-6);

  const radialX = rho > 1e-6 ? relX / rho : fallbackX / fallbackNorm;
  const radialZ = rho > 1e-6 ? relZ / rho : fallbackZ / fallbackNorm;
  const tangentX = -dirSign * radialZ;
  const tangentZ =  dirSign * radialX;

  const radialErr = rho - r;
  const radialVel = state.vel.x * radialX + state.vel.z * radialZ;

  const guide = clamp(ORBIT_GUIDE_GAIN * radialErr / Math.max(r, 1e-3), -0.9, 0.9);
  const desiredDirX = tangentX - guide * radialX;
  const desiredDirZ = tangentZ - guide * radialZ;
  const yawTarget = Math.atan2(-desiredDirZ, desiredDirX);
  const yawErr = wrapAngle(yawTarget - state.attitude.y);

  const thetaCurrent = Math.atan2(state.pos.z - cz, state.pos.x - cx);
  const rawSwept = dirSign > 0
    ? ((thetaCurrent - theta0 + 4 * Math.PI) % (2 * Math.PI))
    : -((theta0 - thetaCurrent + 4 * Math.PI) % (2 * Math.PI));
  const sweptSoFar = rawSwept * dirSign <= Math.abs(sweep) + 0.3 ? rawSwept : 0;
  const progressGeom = clamp((sweptSoFar * dirSign) / Math.max(Math.abs(sweep), 1e-6), 0, 1);
  // The carrot must sit far enough ahead that the navigator's PD position chase
  // sustains the nominal pace: steady-state speed toward a point d ahead is
  // v = KP_POS·d/KD_POS, so d = v·KD_POS/KP_POS (×1.15 margin so the chase
  // doesn't equilibrate just below vNom). Too short a lookahead caps the chase
  // at ~KP_POS·d/KD_POS m/s and the arc times out instead of completing.
  const carrotDist = Math.max(vNom, vH) * state.K.KD_POS / state.K.KP_POS * 1.15;
  const lookaheadFrac = clamp(carrotDist / Math.max(arcLen, 1e-3), 0.02, 0.5);
  const targetProgress = clamp(progressGeom + lookaheadFrac, 0, 1);
  const thetaRef = theta0 + sweep * targetProgress;
  const targetX  = cx + r * Math.cos(thetaRef);
  const targetZ  = cz + r * Math.sin(thetaRef);
  const targetY  = wps[0].y + (wps[2].y - wps[0].y) * progressGeom;
  const targetHeading = Math.atan2(-dirSign * Math.cos(thetaRef), -dirSign * Math.sin(thetaRef));

  const inwardAccel = clamp(
    vEff * vEff / r + KP_RADIAL_ACCEL * radialErr + KD_RADIAL_ACCEL * radialVel,
    -state.K.GRAVITY * Math.tan(MAX_BANK),
    state.K.GRAVITY * Math.tan(MAX_BANK),
  );
  const phi       = clamp(Math.atan(inwardAccel / state.K.GRAVITY), -MAX_BANK, MAX_BANK);
  const omegaBase = Math.abs(inwardAccel) / vEff;
  const omega     = -dirSign * omegaBase + KP_YAW_TRACK * yawErr;

  // Roll: closed-loop on attitude.x. Same cascade structure as navigator_wp:
  // rate_des = KP × err; stick = rate_des / MAX_RATE; clamp.
  const rollErr   = dirSign * phi - state.attitude.x;
  const rollStick = clamp(KP_ROLL_OUTER * rollErr / state.K.MAX_RATE_ROLL_PITCH, -1, 1);

  // Yaw: AETR yaw is normalized desired body yaw rate.
  const yawStick = clamp(omega / state.K.MAX_RATE_YAW, -1, 1);

  // Thrust comp: keep vertical thrust ≈ hover by scaling 1/cos(φ).
  const hoverThrottle = state.K.MASS * state.K.GRAVITY / (4 * state.K.MAX_THRUST_N);
  const thrustStick = clamp(hoverThrottle / Math.max(Math.cos(phi), 0.1), 0, 1);

  // Complete when the drone has swept to within 0.1 rad of the exit angle.
  // Angle-based (not time or distance) so completion is correct regardless of
  // entry speed.  durationTicks * 3 is a safety timeout.
  //
  // Guard: the drone may be slightly behind theta0 when the step starts (WP
  // threshold ≤ 1 m). In that case the modular arithmetic wraps rawSwept to
  // ~2π (nearly a full circle), which would fire completion immediately.
  // Any rawSwept * dirSign > |sweep| + 0.3 is a startup wrap-around; reset to 0.
  const ticks        = Math.round(state.ticksInPhase);
  const arcComplete  = sweptSoFar * dirSign >= Math.abs(sweep) - 0.2;
  const stepStatus   = (arcComplete || ticks >= state.step.durationTicks * CTURN_TIMEOUT_FACTOR) ? STATUS_COMPLETED : STATUS_RUNNING;

  return {
    throttle: thrustStick,
    roll:   rollStick,
    pitch:  0,
    yaw:    yawStick,
    active: 1,
    stepStatus,
    debug: 0,
    targetX,
    targetY,
    targetZ,
    targetYaw: targetHeading,
  };
}
