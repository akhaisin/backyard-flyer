// Hardware: actuator model. Translates desired throttle (%) to actual thrust force (N).
// Models real engine limits: max thrust, spool-up rate, gimbal slew rate.
// Same implementation as floater/blocks/hw.ts — kept local for independence.

type Vec3 = { x: number; y: number; z: number };
type VehicleIn = { desired: Vec3; actual: Vec3 };
type VehicleOut = { actual: Vec3 };
type HwIn = { vehicles: Record<string, VehicleIn> };
type HwOut = { vehicles: Record<string, VehicleOut> };

const MAX_THRUST_N = 30;
const THRUST_RATE_N_PER_S = 60;
const DIR_RATE_RAD_PER_S = 5.0;
const DT = 0.05;

function actuate(state: VehicleIn): VehicleOut {
  const dx = (state.desired.x / 100) * MAX_THRUST_N;
  const dy = (state.desired.y / 100) * MAX_THRUST_N;
  const dz = (state.desired.z / 100) * MAX_THRUST_N;
  const desMagRaw = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const desMag = Math.min(MAX_THRUST_N, desMagRaw);
  const actMag = Math.sqrt(state.actual.x * state.actual.x + state.actual.y * state.actual.y + state.actual.z * state.actual.z);

  const maxDelta = THRUST_RATE_N_PER_S * DT;
  const newMag = actMag + Math.max(-maxDelta, Math.min(maxDelta, desMag - actMag));

  const desDir = desMagRaw > 1e-6
    ? [dx / desMagRaw, dy / desMagRaw, dz / desMagRaw]
    : null;
  const actDir = actMag > 1e-6
    ? [state.actual.x / actMag, state.actual.y / actMag, state.actual.z / actMag]
    : null;

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

export function hw(state: HwIn): HwOut {
  const vehicles: Record<string, VehicleOut> = {};
  for (const [key, vehicle] of Object.entries(state.vehicles)) {
    vehicles[key] = actuate(vehicle);
  }
  return { vehicles };
}
