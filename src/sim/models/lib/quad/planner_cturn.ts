// Coordinated-turn planner + completion checker. Active when step.stepType === STEP_TYPE_CTURN.
//
// Fits a circular arc through the three step.waypoints in the xz plane, then
// derives the physical quantities of a coordinated horizontal turn:
//   v   = arc_length / (durationTicks · DT)   tangential speed (m/s)
//   φ   = atan(v² / (g · r))                  bank angle magnitude (rad)
//   ω   = v / r                                yaw rate magnitude (rad/s)
// Then it adds orbit-tracking feedback from the current position / velocity:
//   • heading target = local tangent direction, tilted inward/outward by radial error
//   • bank magnitude = coordinated-turn baseline plus radial-error damping
// and translates those into AETR sticks for navigator_cturn → fc_acro:
//   roll   = closed-loop on attitude.x toward dirSign · φ_des
//   yaw    = yaw-rate command from nominal ω plus heading error correction
//   throttle = HOVER_THROTTLE / cos(φ)           (maintain vertical thrust)
//   pitch  = 0                                    (level turn; constant altitude)
//
// Sign convention: lib fc_acro applies rate_yaw_des = −aetrYaw × MAX_RATE_YAW.
// A positive arc sweep (CCW, dirSign=+1) needs a positive yaw rate at the drone,
// which requires a NEGATIVE yaw stick. Hence yaw = −dirSign · ω / MAX_RATE_YAW.
//
// Reports STATUS_COMPLETED once ticksInPhase >= step.durationTicks.
// Returns idle (and STATUS_RUNNING) if not active, if waypoints aren't 3, if
// the waypoints are collinear, or if durationTicks ≤ 0.

type Vec3 = { x: number; y: number; z: number };

// Projection of the active step on the bus. stepType gates whether this planner
// is active for the current step; cturn-specific fields are read when it is.
type Step = {
  pos: Vec3;
  stepType?: number;
  durationTicks: number;
  waypoints: Vec3[];
};

type PlannerConsts = {
    DT: number;
    GRAVITY: number;
    MASS: number;
    MAX_THRUST_N: number;
    MAX_RATE_ROLL_PITCH: number;
    MAX_RATE_YAW: number;
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

function step_complete_check(ticks: number, step: Step): boolean {
  return ticks >= step.durationTicks;
}

export function planner_cturn(state: PlannerIn): PlannerOut {
  const idle: PlannerOut = {
    throttle: 0, roll: 0, pitch: 0, yaw: 0,
    active: 0, stepStatus: STATUS_RUNNING,
  };

  if (!state.armed) return idle;
  if (Math.round(state.phase) !== NAVIGATE) return idle;
  if (Math.round(state.step.stepType ?? 0) !== STEP_TYPE_CTURN) return idle;

  const wps = state.step.waypoints;
  if (wps.length !== 3) return idle;
  if (state.step.durationTicks <= 0) return idle;

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
  const omegaNom = vNom / r;

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

  const inwardAccel = clamp(
    vNom * vNom / r + KP_RADIAL_ACCEL * radialErr + KD_RADIAL_ACCEL * radialVel,
    -state.K.GRAVITY * Math.tan(MAX_BANK),
    state.K.GRAVITY * Math.tan(MAX_BANK),
  );
  const phi = clamp(Math.atan(inwardAccel / state.K.GRAVITY), -MAX_BANK, MAX_BANK);
  const omega = dirSign * omegaNom + KP_YAW_TRACK * yawErr;

  // Roll: closed-loop on attitude.x. Same cascade structure as navigator_wp:
  // rate_des = KP × err; stick = rate_des / MAX_RATE; clamp.
  const rollErr   = dirSign * phi - state.attitude.x;
  const rollStick = clamp(KP_ROLL_OUTER * rollErr / state.K.MAX_RATE_ROLL_PITCH, -1, 1);

  // Yaw: fc_acro applies rate = −stick × MAX_RATE, so negate the desired body
  // yaw rate when mapping back to the AETR bus.
  const yawStick = clamp(-omega / state.K.MAX_RATE_YAW, -1, 1);

  // Thrust comp: keep vertical thrust ≈ hover by scaling 1/cos(φ).
  const hoverThrottle = state.K.MASS * state.K.GRAVITY / (4 * state.K.MAX_THRUST_N);
  const thrustStick = clamp(hoverThrottle / Math.max(Math.cos(phi), 0.1), 0, 1);

  const ticks      = Math.round(state.ticksInPhase);
  const stepStatus = step_complete_check(ticks, state.step) ? STATUS_COMPLETED : STATUS_RUNNING;

  return {
    throttle: thrustStick,
    roll:   rollStick,
    pitch:  0,
    yaw:    yawStick,
    active: 1,
    stepStatus,
  };
}
