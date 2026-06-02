// Sensor noise model. Adds Gaussian noise to true state to produce noisy
// sensor readings stored in state.sensors. FC blocks consume these instead of
// true state, simulating real GPS, accelerometer, and gyro measurement errors.
//
// The per-channel std-devs are shared tunables: they arrive as data via state.K
// (consts.ts → QUAD_DEFAULTS), not as imports — edited block source is compiled
// with imports stripped.

type Vec3 = { x: number; y: number; z: number };
type NoiseConsts = {
  POS_STD: number;
  VEL_STD: number;
  ATT_STD: number;
  ANG_VEL_STD: number;
};
type NoiseIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
  K: NoiseConsts;
};
type NoiseOut = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
};

function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function addNoise(v: Vec3, std: number): Vec3 {
  return { x: v.x + randn() * std, y: v.y + randn() * std, z: v.z + randn() * std };
}

export function noise(state: NoiseIn): NoiseOut {
  const K = state.K;
  return {
    pos: addNoise(state.pos, K.POS_STD),
    vel: addNoise(state.vel, K.VEL_STD),
    attitude: addNoise(state.attitude, K.ATT_STD),
    angularVel: addNoise(state.angularVel, K.ANG_VEL_STD),
  };
}