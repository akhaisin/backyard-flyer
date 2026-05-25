import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { floaterMesh } from '../../../vis/plugins/floaterMesh';
import { windArrow } from '../../../vis/plugins/windArrow';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
interface Vehicle { pos: Vec3; vel: Vec3; mission: { targetIdx: number; target: Vec3 }; }
interface PidState { wind: { fx: number; fz: number }; vehicles: { v1: Vehicle; v2: Vehicle }; }
const view = (s: ModelState): PidState => s as unknown as PidState;

const sceneHandler = composeScene(() => [
  baseScene({
    bg: 0x0a0a14,
    camera: { pos: [0, 18, 30], lookAt: [0, 5, 5] },
    grid: { color1: 0x222244, color2: 0x111133 },
    ambient: 0.4,
    directional: 0.8,
  }),
  // PD vehicle (blue)
  floaterMesh(s => ({ pos: view(s).vehicles.v1.pos }), { color: 0x4488ff, emissive: 0x001133 }),
  trail(s => view(s).vehicles.v1.pos, { color: 0x4488ff, length: 400, opacity: 0.6 }),
  waypointTracker(
    s => ({ waypointIdx: view(s).vehicles.v1.mission.targetIdx, target: view(s).vehicles.v1.mission.target }),
    { pendingColor: 0x4488ff },
  ),
  // PID vehicle (orange)
  floaterMesh(s => ({ pos: view(s).vehicles.v2.pos }), { color: 0xff8800, emissive: 0x1a0500 }),
  trail(s => view(s).vehicles.v2.pos, { color: 0xff8800, length: 400, opacity: 0.6 }),
  waypointTracker(
    s => ({ waypointIdx: view(s).vehicles.v2.mission.targetIdx, target: view(s).vehicles.v2.mission.target }),
    { pendingColor: 0xff8800 },
  ),
  windArrow(s => view(s).wind),
]);

export default function FloaterPidVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
