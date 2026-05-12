// Physics: integrates acceleration into velocity and velocity into position.
// Applies gravity. Bounces off the ground (y = 0).

type WorldIn = { x: number; y: number; z: number; vx: number; vy: number; vz: number; ax: number; ay: number; az: number };
type WorldOut = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

const DT = 0.05;       // seconds per tick (matches tickIntervalMs: 50)
const GRAVITY = 9.81;  // m/s²

export function world(state: WorldIn): WorldOut {
  let vx = state.vx + state.ax * DT;
  let vy = state.vy + (state.ay - GRAVITY) * DT;
  let vz = state.vz + state.az * DT;

  let x = state.x + vx * DT;
  let y = state.y + vy * DT;
  let z = state.z + vz * DT;

  if (y < 0) {
    y = 0;
    vy = Math.abs(vy) * 0.3;
  }

  return { x, y, z, vx, vy, vz };
}
