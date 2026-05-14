// Proportional-only flight controller for floater 1.
// No velocity damping — the floater oscillates around each waypoint,
// illustrating why a derivative (or damping) term is needed.

type FcIn = { x: number; y: number; z: number; vx: number; vy: number; vz: number; targetX: number; targetY: number; targetZ: number };
type FcOut = { ax: number; ay: number; az: number };

const K = 3.0;      // proportional gain
const DRAG = 1.5;   // velocity damping
const GRAVITY = 9.81;
const MAX_ACC = 20.0;

function clamp(v: number): number {
  return Math.max(-MAX_ACC, Math.min(MAX_ACC, v));
}

export function fc1(state: FcIn): FcOut {
  const dx = state.targetX - state.x;
  const dy = state.targetY - state.y;
  const dz = state.targetZ - state.z;

  return {
    ax: clamp(dx * K - state.vx * DRAG),
    ay: GRAVITY + clamp(dy * K - state.vy * DRAG),
    az: clamp(dz * K - state.vz * DRAG),
  };
}
