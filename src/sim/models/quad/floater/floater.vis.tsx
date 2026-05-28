import ThreeCanvas from '../../../components/ThreeCanvas';
import { composeScene } from '../../../vis/scenePlugin';
import { baseScene } from '../../../vis/plugins/baseScene';
import { trail } from '../../../vis/plugins/trail';
import { waypointTracker } from '../../../vis/plugins/waypointTracker';
import { floaterMesh } from '../../../vis/plugins/floaterMesh';
import { textLabel } from '../../../vis/plugins/textLabel';
import type { ModelState } from '../../../engine/types';

type Vec3 = { x: number; y: number; z: number };
interface FloaterState {
  pos: Vec3;
  vel: Vec3;
  mission: { targetIdx: number; target: Vec3 };
}
const view = (s: ModelState): FloaterState => s as unknown as FloaterState;

const sceneHandler = composeScene(() => [
  baseScene({
    bg: 0x0a0a14,
    camera: { pos: [5, 18, 22], lookAt: [5, 5, 5] },
    grid: { color1: 0x222244, color2: 0x111133 },
    ambient: 0.4,
    directional: 0.8,
  }),
  floaterMesh(s => ({ pos: view(s).pos, vel: view(s).vel })),
  trail(s => view(s).pos, { length: 400, opacity: 0.6 }),
  waypointTracker(s => ({ waypointIdx: view(s).mission.targetIdx, target: view(s).mission.target })),
  textLabel({
    text: 'Floater\n4-block layered model\nmission → fc → hw → world',
    position: [-10, 0, -10],
    fontSize: 28,
  }),
]);

export default function FloaterVis() {
  return <ThreeCanvas sceneHandler={sceneHandler} />;
}
