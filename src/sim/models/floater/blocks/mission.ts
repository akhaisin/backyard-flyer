// Advances the target waypoint when the floater is close enough.
// Resolves and outputs the target coordinates so fc.ts needs no waypoint table.

type MissionIn = { x: number; y: number; z: number; targetIdx: number };
type MissionOut = { targetIdx: number; dist: number; targetX: number; targetY: number; targetZ: number };

const WAYPOINTS = [
  { x: 0, y: 5, z: 0 },
  { x: 10, y: 5, z: 0 },
  { x: 10, y: 10, z: 10 },
  { x: 0, y: 5, z: 15 },
];

const THRESHOLD = 1.5;
const MAX_LOOPS = 3;

export function mission(state: MissionIn): MissionOut {
  const idx = Math.round(state.targetIdx) % WAYPOINTS.length;
  const loops = Math.round(state.targetIdx / WAYPOINTS.length)

  if (loops > MAX_LOOPS) {
    const distZero = Math.sqrt(state.x * state.x + state.y * state.y + state.z * state.z);
    return { targetIdx: state.targetIdx, dist: distZero, targetX: 0, targetY: 0, targetZ: 0 };  
  }


  const wp = WAYPOINTS[idx];

  const dx = wp.x - state.x;
  const dy = wp.y - state.y;
  const dz = wp.z - state.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  


  if (dist < THRESHOLD) {
    const next = (idx + 1) % WAYPOINTS.length;
    const nwp = WAYPOINTS[next];
    return { targetIdx: next, dist, targetX: nwp.x, targetY: nwp.y, targetZ: nwp.z };
  }
  return { targetIdx: idx, dist, targetX: wp.x, targetY: wp.y, targetZ: wp.z };
}
