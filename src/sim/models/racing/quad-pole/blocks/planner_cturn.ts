// Coordinated-turn planner + completion checker. Active when
// missionType === MISSION_CTURN.
//
// Fits a circular arc through the three step.waypoints in the xz plane, then
// derives the physical quantities of a coordinated horizontal turn:
//   v   = arc_length / (durationTicks · DT)   tangential speed (m/s)
//   φ   = atan(v² / (g · r))                  bank angle magnitude (rad)
//   ω   = v / r                                yaw rate magnitude (rad/s)
// and translates those into AETR sticks for navigator_cturn → fc_acro:
//   roll   = closed-loop on attitude.x toward dirSign · φ
//   yaw    = open-loop rate command dirSign · ω
//   thrust = HOVER_THROTTLE / cos(φ)         (maintain vertical thrust)
//   pitch  = 0                                (level turn; constant altitude)
//
// Sign convention: dirSign comes from the signed arc sweep via atan2 angles
// around the fitted center. atan2 angles decrease CW (math convention);
// drone-frame yaw stick is negative for a left turn. The two cancel so
// dirSign · ω directly maps to the correct stick sign.
//
// Reports STATUS_COMPLETED once ticksInPhase >= step.durationTicks.
// Returns idle (and STATUS_RUNNING) if not active, if waypoints aren't 3, if
// the waypoints are collinear, or if durationTicks ≤ 0.

type Vec3 = { x: number; y: number; z: number };

// Projection of the active step on the bus. Only cturn-relevant fields are
// read here; wp-only fields are also present (zeroed-out by mission) but
// ignored. Gating is by missionType, so no `type` discriminator is needed.
type Step = {
  pos: Vec3;
  durationTicks: number;
  waypoints: Vec3[];
};

type PlannerIn = {
  missionType: number;
  step: Step;
  ticksInPhase: number;
  armed: number;
  phase: number;
  attitude: Vec3;
};

type PlannerOut = {
  thrust: number;
  roll: number;
  pitch: number;
  yaw: number;
  active: number;       // 1 when the maneuver is being executed this tick
  stepStatus: number;
};

const DT             = 0.05;
const NAVIGATE       = 2;
const MISSION_CTURN  = 1;
const HOVER_THROTTLE = 0.245;
const GRAVITY        = 9.81;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

// Outer P-gain for roll-attitude tracking. Mirrors navigator_wp's
// KP_ATT_OUTER so the cascade authority matches the wp stack.
const KP_ROLL_OUTER       = 40.0;
const MAX_RATE_ROLL_PITCH = Math.PI;        // must match fc_acro
const MAX_RATE_YAW        = Math.PI / 2;    // must match fc_acro

// Safety clamp on bank — beyond ~60° the thrust compensation grows unbounded
// and the planner is operating outside any meaningful "coordinated" regime.
const MAX_BANK = Math.PI / 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
    thrust: 0, roll: 0, pitch: 0, yaw: 0,
    active: 0, stepStatus: STATUS_RUNNING,
  };

  if (!state.armed) return idle;
  if (Math.round(state.phase) !== NAVIGATE) return idle;
  if (Math.round(state.missionType) !== MISSION_CTURN) return idle;

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

  const arcLen   = Math.abs(sweep) * r;
  const duration = state.step.durationTicks * DT;
  const v        = arcLen / duration;
  const phi      = Math.min(Math.atan(v * v / (GRAVITY * r)), MAX_BANK);
  const omega    = v / r;

  // Roll: closed-loop on attitude.x. Same cascade structure as navigator_wp:
  // rate_des = KP × err; stick = rate_des / MAX_RATE; clamp.
  const rollErr   = dirSign * phi - state.attitude.x;
  const rollStick = clamp(KP_ROLL_OUTER * rollErr / MAX_RATE_ROLL_PITCH, -1, 1);

  // Yaw: open-loop rate command. fc_acro takes stick × MAX_RATE → rad/s.
  const yawStick = clamp(dirSign * omega / MAX_RATE_YAW, -1, 1);

  // Thrust comp: keep vertical thrust ≈ hover by scaling 1/cos(φ).
  const thrustStick = clamp(HOVER_THROTTLE / Math.max(Math.cos(phi), 0.1), 0, 1);

  const ticks      = Math.round(state.ticksInPhase);
  const stepStatus = step_complete_check(ticks, state.step) ? STATUS_COMPLETED : STATUS_RUNNING;

  return {
    thrust: thrustStick,
    roll:   rollStick,
    pitch:  0,
    yaw:    yawStick,
    active: 1,
    stepStatus,
  };
}
