// Hardware: actuator model. Translates desired throttle (%) to actual thrust force (N).
// Models real engine limits: max thrust, spool-up rate, gimbal slew rate.

type HwIn = { tdx: number; tdy: number; tdz: number; tx: number; ty: number; tz: number };
type HwOut = { tx: number; ty: number; tz: number };

const MAX_THRUST_N = 30;            // saturation
const THRUST_RATE_N_PER_S = 60;     // spool: 0 → max in 0.5 s
const DIR_RATE_RAD_PER_S = 5.0;     // gimbal: ~170°/s
const DT = 0.05;

export function hw(state: HwIn): HwOut {
  // 1. Convert desired throttle % to Newtons and saturate magnitude
  const dx = (state.tdx / 100) * MAX_THRUST_N;
  const dy = (state.tdy / 100) * MAX_THRUST_N;
  const dz = (state.tdz / 100) * MAX_THRUST_N;
  const desMagRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const desMag = Math.min(MAX_THRUST_N, desMagRaw);
  const actMag = Math.sqrt(state.tx * state.tx + state.ty * state.ty + state.tz * state.tz);

  // 2. Rate-limit magnitude (spool inertia)
  const maxDelta = THRUST_RATE_N_PER_S * DT;
  const newMag = actMag + Math.max(-maxDelta, Math.min(maxDelta, desMag - actMag));

  // 3. Unit direction vectors (guard against zero-magnitude)
  const desDir = desMagRaw > 1e-6
    ? [dx / desMagRaw, dy / desMagRaw, dz / desMagRaw]
    : null;
  const actDir = actMag > 1e-6
    ? [state.tx / actMag, state.ty / actMag, state.tz / actMag]
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

  if (!newDir) return { tx: 0, ty: 0, tz: 0 };
  return { tx: newDir[0] * newMag, ty: newDir[1] * newMag, tz: newDir[2] * newMag };
}
