// Hardware: actuator model. Translates desired throttle (%) to actual thrust force (N).
// Models real engine limits: max thrust, spool-up rate, gimbal slew rate.

type Vec3 = { x: number; y: number; z: number };
type HwIn = { desired: Vec3; actual: Vec3 };
type HwOut = { actual: Vec3 };

const MAX_THRUST_N = 30;            // saturation
const THRUST_RATE_N_PER_S = 60;     // spool: 0 → max in 0.5 s
const DIR_RATE_RAD_PER_S = 5.0;     // gimbal
const DT = 0.05;

export function hw(state: HwIn): HwOut {
  // 1. Convert desired throttle % to Newtons and saturate magnitude
  const dx = (state.desired.x / 100) * MAX_THRUST_N;
  const dy = (state.desired.y / 100) * MAX_THRUST_N;
  const dz = (state.desired.z / 100) * MAX_THRUST_N;
  const desMagRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const desMag = Math.min(MAX_THRUST_N, desMagRaw);
  const actMag = Math.sqrt(state.actual.x * state.actual.x + state.actual.y * state.actual.y + state.actual.z * state.actual.z);

  // 2. Rate-limit magnitude (spool inertia)
  const maxDelta = THRUST_RATE_N_PER_S * DT;
  const newMag = actMag + Math.max(-maxDelta, Math.min(maxDelta, desMag - actMag));

  // 3. Unit direction vectors (guard against zero-magnitude)
  const desDir = desMagRaw > 1e-6
    ? [dx / desMagRaw, dy / desMagRaw, dz / desMagRaw]
    : null;
  const actDir = actMag > 1e-6
    ? [state.actual.x / actMag, state.actual.y / actMag, state.actual.z / actMag]
    : null;

  // 4. Rotate actual direction toward desired by at most DIR_RATE * DT (slerp)
  let newDir = desDir;
  if (actDir && desDir) {
    const dot = Math.max(-1, Math.min(1,
      actDir[0] * desDir[0] + actDir[1] * desDir[1] + actDir[2] * desDir[2]));
    const angle = Math.acos(dot);
    const maxRot = DIR_RATE_RAD_PER_S * DT;
    if (angle > maxRot && angle > 1e-6) {
      const t = maxRot / angle;
      const sinA = Math.sin(angle);
      const a = Math.sin((1 - t) * angle) / sinA;
      const b = Math.sin(t * angle) / sinA;
      newDir = [
        a * actDir[0] + b * desDir[0],
        a * actDir[1] + b * desDir[1],
        a * actDir[2] + b * desDir[2],
      ];
    }
  }

  if (!newDir) return { actual: { x: 0, y: 0, z: 0 } };
  return { actual: { x: newDir[0] * newMag, y: newDir[1] * newMag, z: newDir[2] * newMag } };
}
