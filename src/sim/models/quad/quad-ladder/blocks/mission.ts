// Ladder mission sequencer: arm → takeoff → 9-step Jacob's Ladder → RTH → land → disarm.
//
// Jacob's Ladder Switchback (Y=up, X=forward, Z=right). Three gates at x=12, z=0.
// Gates are entered from ALTERNATING sides — the drone weaves through the structure:
//
//   M1: cross going +x (front→back)  from z=+7 left staging  (x=5)
//   G1: exit guide going −x          arc back to right + climb
//   M2: cross going −x (back→front)  from z=−7 right staging (x=19)
//   G2: exit guide going +x          arc back to left + climb
//   M3: cross going +x (front→back)  from z=+7 left staging  (x=5)
//   G3: exit guide going −x          → RTH
//
// Gate normals encode travel direction (crossing fires when sideScore flips −→+):
//   M1, M3: normal (+1,0,0) — approach from x<12, cross going +x
//   M2:     normal (−1,0,0) — approach from x>12, cross going −x
//   G1, G3: normal (−1,0,0) — approach from x>12 (after +x exit), cross going −x
//   G2:     normal (+1,0,0) — approach from x<12 (after −x exit), cross going +x
//
// 3×3 gate matrix (z columns, y rows):
//   z=−4         z=0          z=+4
//   ·            M3 n=+1      G3 n=−1    y=11
//   G2 n=+1      M2 n=−1      ·          y=7
//   ·            M1 n=+1      G1 n=−1    y=3
//
// Waypoint steps advance on distance < threshold.
// Gate steps advance on plane-crossing within aperture (sign-flip detection).

type Vec3 = { x: number; y: number; z: number };

type StepDef =
  | { kind: 'waypoint'; pos: Vec3; threshold: number }
  | { kind: 'gate'; center: Vec3; normal: Vec3; width: number; height: number };

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  windowSide: number;
};

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  windowSide: number;
  target: Vec3;
  targetNormal: Vec3;
  stepKind: number;   // 0 = waypoint, 1 = gate
  dist: number;
};

const ARMING    = 0;
const TAKEOFF   = 1;
const NAVIGATE  = 2;
const RTH       = 3;
const LAND      = 4;
const DISARMING = 5;
const DONE      = 6;

const STEP_WAYPOINT = 0;
const STEP_GATE     = 1;

const LADDER_X    = 12;
const GATE_SIZE   = 4;
const GATE_STEP   = GATE_SIZE + 0;   // 4 m center-to-center: frames touch, no gap
const APPROACH_X  = 7;   // staging distance behind ladder (x = LADDER_X + APPROACH_X)
const APPROACH_Z  = 7;         // lateral staging offset for left/right arcs
const GUIDE_Z     = GATE_SIZE; // guide gate center offset — places edge flush with main gate edge
const CRUISE_ALT  = 3;   // takeoff altitude = gate 1 center altitude

const GATE_Y1 = CRUISE_ALT;                   //  3
const GATE_Y2 = CRUISE_ALT + GATE_STEP;       //  8
const GATE_Y3 = CRUISE_ALT + 2 * GATE_STEP;  // 13

const HOME: Vec3     = { x: 0, y: CRUISE_ALT, z: 0 };
const LAND_PAD: Vec3 = { x: 0, y: 0,          z: 0 };

type GateDef = { center: Vec3; normal: Vec3; width: number; height: number; label?: string };

// Main gates: alternating normals for Jacob's Ladder Switchback.
// M1/M3 crossed going +x (front→back); M2 crossed going −x (back→front).
export const GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1, z: 0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M1' },
  { center: { x: LADDER_X, y: GATE_Y2, z: 0 }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M2' },
  { center: { x: LADDER_X, y: GATE_Y3, z: 0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M3' },
];

// Guide gates: exit constrainers offset in Z, opposite normals to their paired main gate.
// G1/G3 crossed going −x (after +x main exit); G2 crossed going +x (after −x main exit).
export const GUIDE_GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1, z: +GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G1' },
  { center: { x: LADDER_X, y: GATE_Y2, z: -GUIDE_Z }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G2' },
  { center: { x: LADDER_X, y: GATE_Y3, z: +GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G3' },
];

const STEPS: StepDef[] = [
  { kind: 'waypoint', pos: { x: LADDER_X - APPROACH_X, y: GATE_Y1, z: +APPROACH_Z }, threshold: 1.5 },
  { kind: 'gate', ...GATES[0] },        // M1: cross going +x (front→back), left approach
  { kind: 'gate', ...GUIDE_GATES[0] },  // G1: exit guide going −x → arc right + climb
  { kind: 'waypoint', pos: { x: LADDER_X + APPROACH_X, y: GATE_Y2, z: -APPROACH_Z }, threshold: 1.5 },
  { kind: 'gate', ...GATES[1] },        // M2: cross going −x (back→front), right approach
  { kind: 'gate', ...GUIDE_GATES[1] },  // G2: exit guide going +x → arc left + climb
  { kind: 'waypoint', pos: { x: LADDER_X - APPROACH_X, y: GATE_Y3, z: +APPROACH_Z }, threshold: 1.5 },
  { kind: 'gate', ...GATES[2] },        // M3: cross going +x (front→back), left approach
  { kind: 'gate', ...GUIDE_GATES[2] },  // G3: exit guide going −x → RTH
];

const ARMING_TICKS  = 20;
const RTH_THRESHOLD = 1.2;
const DUMMY_NORMAL: Vec3 = { x: 1, y: 0, z: 0 };

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sideScore(pos: Vec3, gate: GateDef): number {
  return (pos.x - gate.center.x) * gate.normal.x
       + (pos.y - gate.center.y) * gate.normal.y
       + (pos.z - gate.center.z) * gate.normal.z;
}

function perpDist(pos: Vec3, gate: GateDef): number {
  const s  = sideScore(pos, gate);
  const rx = (pos.x - gate.center.x) - s * gate.normal.x;
  const ry = (pos.y - gate.center.y) - s * gate.normal.y;
  const rz = (pos.z - gate.center.z) - s * gate.normal.z;
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  windowSide: number, target: Vec3, targetNormal: Vec3, stepKind: number, dist: number,
): MissionOut {
  return { phase, stepIdx, ticksInPhase, armed, windowSide, target, targetNormal, stepKind, dist };
}

export function mission(state: MissionIn): MissionOut {
  const phase   = Math.round(state.phase);
  const stepIdx = Math.round(state.stepIdx);
  const ticks   = Math.round(state.ticksInPhase);

  if (phase === ARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(TAKEOFF, 0, 0, 1, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, HOME));
    }
    return makeOut(ARMING, 0, ticks + 1, 0, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, 0);
  }

  if (phase === TAKEOFF) {
    if (state.pos.y >= CRUISE_ALT - 0.3) {
      const s = STEPS[0] as Extract<StepDef, { kind: 'waypoint' }>;
      return makeOut(NAVIGATE, 0, 0, 1, 0, s.pos, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, s.pos));
    }
    return makeOut(TAKEOFF, 0, ticks + 1, 1, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, HOME));
  }

  if (phase === NAVIGATE) {
    const step = STEPS[stepIdx];

    if (step.kind === 'waypoint') {
      const d = dist3(state.pos, step.pos);
      if (d < step.threshold) {
        const next = stepIdx + 1;
        if (next >= STEPS.length) {
          return makeOut(RTH, stepIdx, 0, 1, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, HOME));
        }
        const ns = STEPS[next];
        const nt = ns.kind === 'waypoint' ? ns.pos : ns.center;
        const nn = ns.kind === 'gate'     ? ns.normal : DUMMY_NORMAL;
        const nk = ns.kind === 'gate'     ? STEP_GATE : STEP_WAYPOINT;
        return makeOut(NAVIGATE, next, 0, 1, 0, nt, nn, nk, dist3(state.pos, nt));
      }
      return makeOut(NAVIGATE, stepIdx, ticks + 1, 1, Math.round(state.windowSide),
                     step.pos, DUMMY_NORMAL, STEP_WAYPOINT, d);
    }

    // Gate step
    const gate        = step;
    const score       = sideScore(state.pos, gate);
    const currentSide = score > 0 ? 1 : -1;
    const prevSide    = Math.round(state.windowSide);

    if (prevSide === 0) {
      return makeOut(NAVIGATE, stepIdx, ticks + 1, 1, currentSide,
                     gate.center, gate.normal, STEP_GATE, dist3(state.pos, gate.center));
    }

    const planeCrossed = prevSide === -1 && currentSide === 1;
    const withinFrame  = perpDist(state.pos, gate) < Math.max(gate.width, gate.height) / 2;

    if (planeCrossed && withinFrame) {
      const next = stepIdx + 1;
      if (next >= STEPS.length) {
        return makeOut(RTH, stepIdx, 0, 1, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, HOME));
      }
      const ns = STEPS[next];
      const nt = ns.kind === 'waypoint' ? ns.pos : ns.center;
      const nn = ns.kind === 'gate'     ? ns.normal : DUMMY_NORMAL;
      const nk = ns.kind === 'gate'     ? STEP_GATE : STEP_WAYPOINT;
      return makeOut(NAVIGATE, next, 0, 1, 0, nt, nn, nk, dist3(state.pos, nt));
    }

    return makeOut(NAVIGATE, stepIdx, ticks + 1, 1, currentSide,
                   gate.center, gate.normal, STEP_GATE, dist3(state.pos, gate.center));
  }

  if (phase === RTH) {
    const d = dist3(state.pos, HOME);
    if (d < RTH_THRESHOLD) {
      return makeOut(LAND, 0, 0, 1, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, dist3(state.pos, LAND_PAD));
    }
    return makeOut(RTH, stepIdx, ticks + 1, 1, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, d);
  }

  if (phase === LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < 0.3) {
      return makeOut(DISARMING, 0, 0, 0, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, d);
    }
    return makeOut(LAND, 0, ticks + 1, 1, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, d);
  }

  if (phase === DISARMING) {
    if (ticks >= ARMING_TICKS) {
      return makeOut(DONE, 0, 0, 0, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, 0);
    }
    return makeOut(DISARMING, 0, ticks + 1, 0, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, 0);
  }

  // DONE — restart
  if (ticks >= 20) {
    return makeOut(ARMING, 0, 0, 0, 0, HOME, DUMMY_NORMAL, STEP_WAYPOINT, 0);
  }
  return makeOut(DONE, 0, ticks + 1, 0, 0, LAND_PAD, DUMMY_NORMAL, STEP_WAYPOINT, 0);
}
