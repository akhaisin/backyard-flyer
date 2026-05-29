// 6DOF rigid body physics for X-config quadrotor with wind disturbance.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     positions: M0(+X,-Z), M1(+X,+Z), M2(-X,+Z), M3(-X,-Z)
//       \   /
//       /   \
//   M3(CW)  · M2(CCW)
//
// Wind forces (windFx, windFz) are applied as horizontal world-frame forces
// in addition to the aerodynamic thrust forces.

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type WorldIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3; thrust: Motors4;
  windFx: number; windFz: number;
};
type WorldOut = { pos: Vec3; vel: Vec3; acc: Vec3; attitude: Vec3; angularVel: Vec3 };

const DT = 0.05;
const MASS = 1.0;
const GRAVITY = 9.81;
const ARM = 0.2;
const K_DRAG = 0.02;
const I_XX = 0.01;
const I_ZZ = 0.01;
const I_YY = 0.02;
const GROUND_DAMP = 0.7;  // friction coefficient applied on ground contact

export function world(state: WorldIn): WorldOut {
  const { m0, m1, m2, m3 } = state.thrust;

  const tau_roll  = ARM    * ( m0 - m1 - m2 + m3);
  const tau_pitch = ARM    * ( m0 + m1 - m2 - m3);
  const tau_yaw   = K_DRAG * (-m0 + m1 - m2 + m3);

  let wx = state.angularVel.x + (tau_roll  / I_XX) * DT;
  let wy = state.angularVel.y + (tau_yaw   / I_YY) * DT;
  let wz = state.angularVel.z + (tau_pitch / I_ZZ) * DT;

  let phi   = state.attitude.x + wx * DT;
  let psi   = state.attitude.y + wy * DT;
  let theta = state.attitude.z + wz * DT;

  const F = m0 + m1 + m2 + m3;
  const cr = Math.cos(phi),   sr = Math.sin(phi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cp = Math.cos(psi),   sp = Math.sin(psi);

  const ax = F * (-cp * st * cr + sp * sr) / MASS + state.windFx / MASS;
  const ay = F * ( ct * cr             ) / MASS - GRAVITY;
  const az = F * ( sp * st * cr + cp * sr) / MASS + state.windFz / MASS;

  let vx = state.vel.x + ax * DT;
  let vy = state.vel.y + ay * DT;
  let vz = state.vel.z + az * DT;
  let x  = state.pos.x + vx * DT;
  let y  = state.pos.y + vy * DT;
  let z  = state.pos.z + vz * DT;

  // Ground constraint — damp linear velocity, angular velocity, and attitude
  // so the drone settles flat after a few ticks regardless of armed state.
  if (y <= 0) {
    y = 0;
    if (vy < 0) vy = 0;
    vx *= GROUND_DAMP;  vz *= GROUND_DAMP;
    wx *= GROUND_DAMP;  wy *= GROUND_DAMP;  wz *= GROUND_DAMP;
    phi   *= GROUND_DAMP;
    psi   *= GROUND_DAMP;
    theta *= GROUND_DAMP;
  }

  return {
    pos: { x, y, z },
    vel: { x: vx, y: vy, z: vz },
    acc: { x: ax, y: ay, z: az },
    attitude:   { x: phi,  y: psi, z: theta },
    angularVel: { x: wx,   y: wy,  z: wz    },
  };
}
