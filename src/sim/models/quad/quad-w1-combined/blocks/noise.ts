// Sensor noise model. Adds Gaussian noise to true state to produce noisy
// sensor readings stored in state.sensors. FC blocks consume these instead of
// true state, simulating real GPS, accelerometer, and gyro measurement errors.
// Pattern mirrors floater-pid's wind block: a standalone generator block that
// writes a sub-tree the downstream blocks read from.

type Vec3 = { x: number; y: number; z: number };
type NoiseIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
};
type NoiseOut = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
};

const POS_STD     = 0.02;   // m   — GPS horizontal / vertical noise
const VEL_STD     = 0.02;   // m/s — velocity estimate noise
const ATT_STD     = 0.0002;  // rad — IMU attitude noise (~0.3°)
const ANG_VEL_STD = 0.002;   // rad/s — gyro noise

// Box-Muller Gaussian sample (zero mean, unit variance).
function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function addNoise(v: Vec3, std: number): Vec3 {
  return { x: v.x + randn() * std, y: v.y + randn() * std, z: v.z + randn() * std };
}

export function noise(state: NoiseIn): NoiseOut {
  return {
    pos:        addNoise(state.pos,        POS_STD),
    vel:        addNoise(state.vel,        VEL_STD),
    attitude:   addNoise(state.attitude,   ATT_STD),
    angularVel: addNoise(state.angularVel, ANG_VEL_STD),
  };
}
