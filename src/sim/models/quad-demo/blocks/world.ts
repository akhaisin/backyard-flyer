// Physics: integrates F=ma with gravity. Clamps to ground (y >= 0).

type Vec3 = { x: number; y: number; z: number };
type WorldIn = { pos: Vec3; vel: Vec3; actual: Vec3 };
type WorldOut = { pos: Vec3; vel: Vec3; acc: Vec3 };

const DT = 0.05;
const MASS = 1.0;
const GRAVITY = 9.81;

export function world(state: WorldIn): WorldOut {
  const ax = state.actual.x / MASS;
  const ay = (state.actual.y - MASS * GRAVITY) / MASS;
  const az = state.actual.z / MASS;

  let vx = state.vel.x + ax * DT;
  let vy = state.vel.y + ay * DT;
  let vz = state.vel.z + az * DT;
  let x = state.pos.x + vx * DT;
  let y = state.pos.y + vy * DT;
  let z = state.pos.z + vz * DT;

  if (y < 0) {
    y = 0;
    vy = Math.abs(vy) * 0.2;
  }

  return { pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, acc: { x: ax, y: ay, z: az } };
}
