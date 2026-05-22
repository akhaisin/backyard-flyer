// 6DOF rigid body physics for X-config quadrotor.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     positions: M0(+X,-Z), M1(+X,+Z), M2(-X,+Z), M3(-X,-Z)
//       \   /
//       /   \
//   M3(CW)  · M2(CCW)
//
// Attitude Euler angles (rotation order: Ry(yaw) · Rz(pitch) · Rx(roll)):
//   attitude.x = roll  φ: around X (forward); positive → left side up
//   attitude.z = pitch θ: around Z (right);   positive → nose up
//   attitude.y = yaw   ψ: around Y (up);      positive → turn left (CCW from above)
//
// Torque equations (body frame):
//   τ_roll  = ARM · (F0 - F1 - F2 + F3)
//   τ_pitch = ARM · (F0 + F1 - F2 - F3)
//   τ_yaw   = K_DRAG · (-F0 + F1 - F2 + F3)

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type WorldIn = { pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3; thrust: Motors4 };
type WorldOut = { pos: Vec3; vel: Vec3; acc: Vec3; attitude: Vec3; angularVel: Vec3 };

const DT = 0.05;
const MASS = 1.0;
const GRAVITY = 9.81;
const ARM = 0.2;
const K_DRAG = 0.02;
const I_XX = 0.01;  // roll  moment of inertia (kg·m²)
const I_ZZ = 0.01;  // pitch moment of inertia
const I_YY = 0.02;  // yaw   moment of inertia

export function world(state: WorldIn): WorldOut {
  const { m0, m1, m2, m3 } = state.thrust;

  // Torques in body frame
  const tau_roll  = ARM    * ( m0 - m1 - m2 + m3);
  const tau_pitch = ARM    * ( m0 + m1 - m2 - m3);
  const tau_yaw   = K_DRAG * (-m0 + m1 - m2 + m3);

  // Angular acceleration → integrate angular velocity
  const wx = state.angularVel.x + (tau_roll  / I_XX) * DT;
  const wy = state.angularVel.y + (tau_yaw   / I_YY) * DT;
  const wz = state.angularVel.z + (tau_pitch / I_ZZ) * DT;

  // Euler angle rates ≈ body angular velocity (valid for small angles near hover)
  const phi   = state.attitude.x + wx * DT;
  const psi   = state.attitude.y + wy * DT;
  const theta = state.attitude.z + wz * DT;

  // Rotate body thrust vector (0, F_total, 0) to world frame.
  // R = Ry(psi) · Rz(theta) · Rx(phi) applied to (0,1,0):
  const F = m0 + m1 + m2 + m3;
  const cr = Math.cos(phi),   sr = Math.sin(phi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cp = Math.cos(psi),   sp = Math.sin(psi);

  const ax = F * (-cp * st * cr + sp * sr) / MASS;
  const ay = F * ( ct * cr             ) / MASS - GRAVITY;
  const az = F * ( sp * st * cr + cp * sr) / MASS;

  // Integrate velocity and position
  let vx = state.vel.x + ax * DT;
  let vy = state.vel.y + ay * DT;
  let vz = state.vel.z + az * DT;
  let x  = state.pos.x + vx * DT;
  let y  = state.pos.y + vy * DT;
  let z  = state.pos.z + vz * DT;

  // Ground constraint
  if (y <= 0) {
    y = 0;
    if (vy < 0) vy = 0;
    vx *= 0.7;
    vz *= 0.7;
  }

  return {
    pos: { x, y, z },
    vel: { x: vx, y: vy, z: vz },
    acc: { x: ax, y: ay, z: az },
    attitude:   { x: phi,  y: psi, z: theta },
    angularVel: { x: wx,   y: wy,  z: wz    },
  };
}
