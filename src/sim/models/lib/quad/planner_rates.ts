// Rates-step completion checker.
//
// Completion is time-based: once ticksInPhase >= step.duration, the step is
// done and STATUS_COMPLETED is reported to mission. Works only in PHASE_NAVIGATE;
// other phases leave stepStatus at STATUS_RUNNING so planner_wp (if present)
// can handle fly-back / RTH without interference.

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; duration?: number };

type PlannerIn = {
  ticksInPhase: number;
  step: Step;
  armed: number;
  phase: number;
};

type PlannerOut = {
  stepStatus: number;
};

const NAVIGATE = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

export function planner_rates(state: PlannerIn): PlannerOut {
  const phase = Math.round(state.phase);
  const navigating = !!state.armed && phase === NAVIGATE;
  const duration = state.step.duration ?? 60;
  const done = state.ticksInPhase >= duration;
  const stepStatus = navigating && done ? STATUS_COMPLETED : STATUS_RUNNING;
  return { stepStatus };
}
