// target_c1 — kinematic ghost target for the c1 chase family.
//
// Moves a point continuously around ALL K.steps in sequence, independent of
// the mission's stepIdx. The target resets whenever mission.phase is not
// NAVIGATE, so each new attempt starts fresh at K.steps[0].pos.
//
// Phases:
//   0 = TARGET_IDLE    — outside NAVIGATE; holds at steps[0].pos
//   1 = TARGET_MOVING  — advancing through the circuit
//   2 = TARGET_LAPPED  — completed all steps; holds at last dest until reset
//
// Because block source is compiled with imports stripped, NAVIGATE and the
// TARGET_* constants are declared inline.

type Vec3 = { x: number; y: number; z: number };
type C1aStep = { pos: Vec3; dest: Vec3; speed: number };
type K = { DT: number; steps: C1aStep[] };

type TargetIn = {
  missionPhase:  number;
  activeStepIdx: number;
  pos:           Vec3;
  phase:         number;
  K:             K;
};

type TargetOut = {
  pos:           Vec3;
  phase:         number;
  activeStepIdx: number;
};

const NAVIGATE      = 2;
const TARGET_IDLE   = 0;
const TARGET_MOVING = 1;
const TARGET_LAPPED = 2;

export function target_c1(state: TargetIn): TargetOut {
  const missionPhase  = Math.round(state.missionPhase);
  const steps         = state.K.steps as C1aStep[];
  const spawnPos      = steps.length > 0 ? steps[0].pos : state.pos;

  // Outside NAVIGATE (arming, takeoff, RTH, restart fly-back): reset to start.
  if (missionPhase !== NAVIGATE || steps.length === 0) {
    return { pos: spawnPos, phase: TARGET_IDLE, activeStepIdx: -1 };
  }

  const activeStepIdx = Math.round(state.activeStepIdx);
  const currentPhase  = Math.round(state.phase);

  // Returning from idle / first tick of NAVIGATE: spawn at step 0.
  if (activeStepIdx < 0 || currentPhase === TARGET_IDLE) {
    return { pos: spawnPos, phase: TARGET_MOVING, activeStepIdx: 0 };
  }

  // Completed the full circuit: hold at last dest until mission resets.
  if (currentPhase === TARGET_LAPPED) {
    return { pos: state.pos, phase: TARGET_LAPPED, activeStepIdx: activeStepIdx };
  }

  const stepIdx = Math.min(activeStepIdx, steps.length - 1);
  const step    = steps[stepIdx];

  // Advance toward current step's dest at speed * DT.
  const dx = step.dest.x - state.pos.x;
  const dy = step.dest.y - state.pos.y;
  const dz = step.dest.z - state.pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const stepDist = step.speed * state.K.DT;

  if (d <= stepDist) {
    const nextIdx = stepIdx + 1;
    if (nextIdx >= steps.length) {
      return { pos: step.dest, phase: TARGET_LAPPED, activeStepIdx: stepIdx };
    }
    return { pos: step.dest, phase: TARGET_MOVING, activeStepIdx: nextIdx };
  }

  const s = stepDist / d;
  return {
    pos: { x: state.pos.x + dx * s, y: state.pos.y + dy * s, z: state.pos.z + dz * s },
    phase: TARGET_MOVING,
    activeStepIdx: stepIdx,
  };
}
