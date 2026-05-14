// Shared physics for both floaters.
// Integrates acceleration → velocity → position for each craft independently.
// Applies ground collision (y = 0) with energy loss.

type WorldIn = {
  x1: number; y1: number; z1: number; vx1: number; vy1: number; vz1: number; ax1: number; ay1: number; az1: number;
  x2: number; y2: number; z2: number; vx2: number; vy2: number; vz2: number; ax2: number; ay2: number; az2: number;
};
type WorldOut = {
  x1: number; y1: number; z1: number; vx1: number; vy1: number; vz1: number;
  x2: number; y2: number; z2: number; vx2: number; vy2: number; vz2: number;
};

const DT = 0.05;
const GRAVITY = 9.81;

function step(x: number, y: number, z: number, vx: number, vy: number, vz: number, ax: number, ay: number, az: number) {
  let nvx = vx + ax * DT;
  let nvy = vy + (ay - GRAVITY) * DT;
  let nvz = vz + az * DT;
  let nx = x + nvx * DT;
  let ny = y + nvy * DT;
  let nz = z + nvz * DT;
  if (ny < 0) { ny = 0; nvy = Math.abs(nvy) * 0.3; }
  return { nx, ny, nz, nvx, nvy, nvz };
}

export function world(state: WorldIn): WorldOut {
  const a = step(state.x1, state.y1, state.z1, state.vx1, state.vy1, state.vz1, state.ax1, state.ay1, state.az1);
  const b = step(state.x2, state.y2, state.z2, state.vx2, state.vy2, state.vz2, state.ax2, state.ay2, state.az2);
  return {
    x1: a.nx, y1: a.ny, z1: a.nz, vx1: a.nvx, vy1: a.nvy, vz1: a.nvz,
    x2: b.nx, y2: b.ny, z2: b.nz, vx2: b.nvx, vy2: b.nvy, vz2: b.nvz,
  };
}
