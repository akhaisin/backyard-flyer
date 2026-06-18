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
// Tunables (frame geometry, inertia, drag, ground damping) arrive via state.K.

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type WorldConsts = {
  ARM_LENGTH: number;
  K_DRAG: number;
  I_XX: number;
  I_YY: number;
  I_ZZ: number;
  DT: number;
  MASS: number;
  GRAVITY: number;
  GROUND_DAMP: number;
};

type WorldIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3; thrust: Motors4;
  windFx?: number; windFz?: number;
  K: WorldConsts;
};
type WorldOut = { pos: Vec3; vel: Vec3; acc: Vec3; attitude: Vec3; angularVel: Vec3 };

export function world(state: WorldIn): WorldOut {
  const K = state.K;
  const { m0, m1, m2, m3 } = state.thrust;
  const windFx = state.windFx ?? 0;
  const windFz = state.windFz ?? 0;

  const tau_roll  = K.ARM_LENGTH * ( m0 - m1 - m2 + m3);
  const tau_pitch = K.ARM_LENGTH * ( m0 + m1 - m2 - m3);
  const tau_yaw   = K.K_DRAG     * (-m0 + m1 - m2 + m3);

  let wx = state.angularVel.x + (tau_roll  / K.I_XX) * K.DT;
  let wy = state.angularVel.y + (tau_yaw   / K.I_YY) * K.DT;
  let wz = state.angularVel.z + (tau_pitch / K.I_ZZ) * K.DT;

  let phi   = state.attitude.x + wx * K.DT;
  let psi   = state.attitude.y + wy * K.DT;
  let theta = state.attitude.z + wz * K.DT;

  const F = m0 + m1 + m2 + m3;
  const cr = Math.cos(phi),   sr = Math.sin(phi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cp = Math.cos(psi),   sp = Math.sin(psi);

  const ax = F * (-cp * st * cr + sp * sr) / K.MASS + windFx / K.MASS;
  const ay = F * ( ct * cr             ) / K.MASS - K.GRAVITY;
  const az = F * ( sp * st * cr + cp * sr) / K.MASS + windFz / K.MASS;

  let vx = state.vel.x + ax * K.DT;
  let vy = state.vel.y + ay * K.DT;
  let vz = state.vel.z + az * K.DT;
  let x  = state.pos.x + vx * K.DT;
  let y  = state.pos.y + vy * K.DT;
  let z  = state.pos.z + vz * K.DT;

  if (y <= 0) {
    y = 0;
    if (vy < 0) vy = 0;
    vx *= K.GROUND_DAMP;  vz *= K.GROUND_DAMP;
    wx *= K.GROUND_DAMP;  wy *= K.GROUND_DAMP;  wz *= K.GROUND_DAMP;
    phi   *= K.GROUND_DAMP;
    psi   *= K.GROUND_DAMP;
    theta *= K.GROUND_DAMP;
  }

  return {
    pos: { x, y, z },
    vel: { x: vx, y: vy, z: vz },
    acc: { x: ax, y: ay, z: az },
    attitude:   { x: phi,  y: psi, z: theta },
    angularVel: { x: wx,   y: wy,  z: wz    },
  };
}
