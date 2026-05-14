// Advances the target waypoint for floater 2 (PID).
// Same route shape as floater 1, shifted to positive X.

type MissionIn = { x2: number; y2: number; z2: number; targetIdx2: number };
type MissionOut = { targetIdx2: number; dist2: number; targetX2: number; targetY2: number; targetZ2: number };

const WAYPOINTS = [
  { x: 2,  y: 2, z: -5  },
  { x: 7,  y: 5, z: -2  },

];

const THRESHOLD = 1.5;

export function mission2(state: MissionIn): MissionOut {
  const idx = Math.round(state.targetIdx2) % WAYPOINTS.length;
  const wp = WAYPOINTS[idx];

  const dx = wp.x - state.x2;
  const dy = wp.y - state.y2;
  const dz = wp.z - state.z2;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < THRESHOLD) {
    const next = (idx + 1) % WAYPOINTS.length;
    const nwp = WAYPOINTS[next];
    return { targetIdx2: next, dist2: dist, targetX2: nwp.x, targetY2: nwp.y, targetZ2: nwp.z };
  }
  return { targetIdx2: idx, dist2: dist, targetX2: wp.x, targetY2: wp.y, targetZ2: wp.z };
}
