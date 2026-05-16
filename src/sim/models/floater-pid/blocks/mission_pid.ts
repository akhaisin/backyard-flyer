// Waypoint sequencer for the RIGHT floater (PID-controlled; positive-x mirror of mission_pd's route).
// Same Y and Z schedule as mission_pd; X coordinates are negated.
// Tracks completed laps by incrementing `loops` each time targetIdx wraps to 0.

type Vec3 = { x: number; y: number; z: number };
type MissionIn = { pos: Vec3; targetIdx: number; loops: number };
type MissionOut = { targetIdx: number; dist: number; target: Vec3; loops: number };

const WAYPOINTS: Vec3[] = [
  { x: 5,  y: 5,  z: -5 },
  { x: 10, y: 5,  z: 5  },
  { x: 10, y: 10, z: 10 },
  { x: 5,  y: 5,  z: 15 },
];

const THRESHOLD = 1.5;

export function mission_pid(state: MissionIn): MissionOut {
  const idx = Math.round(state.targetIdx) % WAYPOINTS.length;
  const wp = WAYPOINTS[idx];
  const dx = wp.x - state.pos.x;
  const dy = wp.y - state.pos.y;
  const dz = wp.z - state.pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < THRESHOLD) {
    const next = (idx + 1) % WAYPOINTS.length;
    const loops = state.loops + (next === 0 ? 1 : 0);
    const nwp = WAYPOINTS[next];
    return { targetIdx: next, dist, target: { x: nwp.x, y: nwp.y, z: nwp.z }, loops };
  }
  return { targetIdx: idx, dist, target: { x: wp.x, y: wp.y, z: wp.z }, loops: state.loops };
}
