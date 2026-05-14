// Advances the target waypoint for floater 1 (P-only).
// Same route shape as floater 2, shifted to negative X.

type MissionIn = { x1: number; y1: number; z1: number; targetIdx1: number };
type MissionOut = { targetIdx1: number; dist1: number; targetX1: number; targetY1: number; targetZ1: number };

const WAYPOINTS = [
  { x: -2,  y: 2, z: -5  },
  { x: -7,  y: 5, z: -2  },

];

const THRESHOLD = 1.5;

export function mission1(state: MissionIn): MissionOut {
  const idx = Math.round(state.targetIdx1) % WAYPOINTS.length;
  const wp = WAYPOINTS[idx];

  const dx = wp.x - state.x1;
  const dy = wp.y - state.y1;
  const dz = wp.z - state.z1;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < THRESHOLD) {
    const next = (idx + 1) % WAYPOINTS.length;
    const nwp = WAYPOINTS[next];
    return { targetIdx1: next, dist1: dist, targetX1: nwp.x, targetY1: nwp.y, targetZ1: nwp.z };
  }
  return { targetIdx1: idx, dist1: dist, targetX1: wp.x, targetY1: wp.y, targetZ1: wp.z };
}
