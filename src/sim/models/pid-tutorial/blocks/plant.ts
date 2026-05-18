type PlantLocal = {
  mass: number | null;
  damping: number | null;
  control: number;
  pos: number;
  vel: number;
};

type PlantOut = {
  pos: number;
  vel: number;
  out: number;
};

const DT = 0.05;

export function plant(local: PlantLocal): PlantOut {
  const mass = local.mass ?? 1.0;
  const damping = local.damping ?? 0.5;
  const accel = (local.control - damping * local.vel) / mass;
  const vel = local.vel + DT * accel;
  const pos = local.pos + DT * vel;
  return { pos, vel, out: pos };
}
