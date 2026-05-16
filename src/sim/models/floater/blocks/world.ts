// Physics: receives thrust force (Newtons, world frame) from HW.
// Adds gravity, integrates F=ma into velocity and position.
// Bounces off the ground (y = 0).

type WorldIn = { x: number; y: number; z: number; vx: number; vy: number; vz: number; tx: number; ty: number; tz: number };
type WorldOut = { x: number; y: number; z: number; vx: number; vy: number; vz: number; ax: number; ay: number; az: number };

const DT = 0.05;
const MASS = 1.0;
const GRAVITY = 9.81;

export function world(state: WorldIn): WorldOut {
  // Sum of forces → acceleration
  const ax = state.tx / MASS;
  const ay = (state.ty - MASS * GRAVITY) / MASS;
  const az = state.tz / MASS;

  // Semi-implicit Euler
  let vx = state.vx + ax * DT;
  let vy = state.vy + ay * DT;
  let vz = state.vz + az * DT;
  let x = state.x + vx * DT;
  let y = state.y + vy * DT;
  let z = state.z + vz * DT;

  if (y < 0) {
    y = 0;
    vy = Math.abs(vy) * 0.3;
  }

  return { x, y, z, vx, vy, vz, ax, ay, az };
}
