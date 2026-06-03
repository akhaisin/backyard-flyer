// Generic waypoint mission — phase state machine, route supplied as data.
//
// Mission owns step sequencing only; completion checks live in planner_wp. Each
// tick the planner reports stepStatus and mission dispatches on PHASE_NAVIGATE:
//   STATUS_RUNNING   → tick++
//   STATUS_COMPLETED → advance stepIdx (or PHASE_RTH if last)
//   STATUS_FAILED    → abort to PHASE_RTH
//   STATUS_RESTART   → enter PHASE_RESTART: fly back to the step's start anchor
//                      (previous gate / HOME) and re-run the SAME step. The
//                      window planner reports a missed gate via STATUS_RESTART;
//                      the fly-back is a plain waypoint, so a second planner_wp
//                      reports arrival (statusReturn). Waypoint models never emit
//                      STATUS_RESTART, so PHASE_RESTART stays dormant for them.
// If step.timeout is set and ticksInPhase reaches it, mission overrides the
// reported status to FAILED. Timeouts only apply in PHASE_NAVIGATE.
//
// This block is fully generic: the route (navigate waypoints) and all scalars
// (CRUISE_ALT, ARMING_TICKS, RTH/LAND thresholds) arrive together in the params
// bag via state.K — state.K.steps is the model's route. PHASE_*/STATUS_* are
// protocol enums and stay here.
//
// segStart/segEnd are emitted alongside the step bus so the cross-track
// validator keeps working unchanged.

type Vec3 = { x: number; y: number; z: number };
type RateRange = { start: number; end: number };
// Discriminated union mirroring consts.ts StepDef. Mission only reads `pos`
// and (optionally) `timeout`; all other variant fields ride the bus untouched
// so the matching planner can read them.
// Numeric type constants (mirror consts.ts STEP_* — kept inline because
// block source is compiled with imports stripped).
const STEP_TYPE_WP = 0, STEP_TYPE_W1A = 1, STEP_TYPE_W1B = 2, STEP_TYPE_RATES = 3;
type WpStep    = { type: 0; pos: Vec3; threshold: number; timeout?: number };
type W1aStep   = { type: 1; pos: Vec3; normal: Vec3; width: number; height: number; timeout?: number };
type W1bStep   = { type: 2; pos: Vec3; normal: Vec3; width: number; height: number; preStageDist: number; timeout?: number };
type RatesStep = { type: 3; pos: Vec3; duration: number; throttle: RateRange; yaw: RateRange; pitch: RateRange; roll: RateRange; timeout?: number };
type StepDef = WpStep | W1aStep | W1bStep | RatesStep;
type MissionConsts = {
  steps: StepDef[];
  CRUISE_ALT: number;
  ARMING_TICKS: number;
  RTH_THRESHOLD: number;
  LAND_THRESHOLD: number;
  HOME_X: number;
  HOME_Z: number;
};

type MissionIn = {
  pos: Vec3;
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  statusWp: number;      // primary step planner (window crossing / waypoint reach)
  statusReturn?: number; // recovery-waypoint planner: arrival at the start anchor
  K: MissionConsts;
};

// What rides the bus to the planner. `type` is NOT included — ModelState
// only permits number/Vec3/RateRange values, not string literals. Planners
// discriminate by the fields they read, not by type; mission itself never
// needs to know the variant.
type StepBus = {
  pos: Vec3;
  threshold?: number;
  normal?: Vec3;
  width?: number;
  height?: number;
  preStageDist?: number;
  duration?: number;
  throttle?: RateRange;
  yaw?: RateRange;
  pitch?: RateRange;
  roll?: RateRange;
  timeout?: number;
};

type MissionOut = {
  phase: number;
  stepIdx: number;
  ticksInPhase: number;
  armed: number;
  step: StepBus;
  target: Vec3;
  dist: number;
  segStart: Vec3;
  segEnd: Vec3;
};

// Phase enums are the mission contract — exported for consumers that can import
// (e.g. vis). Blocks themselves keep inline copies because the source editor
// strips imports before recompiling.
export const PHASE_ARMING    = 0;
export const PHASE_TAKEOFF   = 1;
export const PHASE_NAVIGATE  = 2;
export const PHASE_RTH       = 3;
export const PHASE_LAND      = 4;
export const PHASE_DISARMING = 5;
export const PHASE_DONE      = 6;
export const PHASE_RESTART   = 7;

const STATUS_COMPLETED = 1;
const STATUS_FAILED    = 2;
const STATUS_RESTART   = 3;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function stepToBus(step: StepDef): StepBus {
  switch (step.type) {
    case STEP_TYPE_WP:    return { pos: step.pos, threshold: step.threshold, timeout: step.timeout };
    case STEP_TYPE_W1A:   return { pos: step.pos, normal: step.normal, width: step.width, height: step.height, timeout: step.timeout };
    case STEP_TYPE_W1B:   return { pos: step.pos, normal: step.normal, width: step.width, height: step.height, preStageDist: step.preStageDist, timeout: step.timeout };
    case STEP_TYPE_RATES: return { pos: step.pos, duration: step.duration, throttle: step.throttle, yaw: step.yaw, pitch: step.pitch, roll: step.roll, timeout: step.timeout };
  }
}

function makeOut(
  phase: number, stepIdx: number, ticksInPhase: number, armed: number,
  step: StepDef, target: Vec3, dist: number,
  segStart: Vec3 = target, segEnd: Vec3 = target,
): MissionOut {
  return {
    phase, stepIdx, ticksInPhase, armed,
    step: stepToBus(step),
    target, dist, segStart, segEnd,
  };
}

export function mission(state: MissionIn): MissionOut {
  const K = state.K;
  const steps = state.K.steps;

  const HOME: Vec3     = { x: K.HOME_X, y: K.CRUISE_ALT, z: K.HOME_Z };
  const LAND_PAD: Vec3 = { x: K.HOME_X, y: 0,            z: K.HOME_Z };
  const HOME_STEP: StepDef = { type: STEP_TYPE_WP, pos: HOME,     threshold: K.RTH_THRESHOLD };
  const LAND_STEP: StepDef = { type: STEP_TYPE_WP, pos: LAND_PAD, threshold: K.LAND_THRESHOLD };

  const segStartFor = (stepIdx: number): Vec3 =>
    stepIdx === 0 ? HOME : steps[stepIdx - 1].pos;

  const navigateStep = (stepIdx: number, ticks: number, pos: Vec3): MissionOut => {
    const step = steps[stepIdx];
    return makeOut(
      PHASE_NAVIGATE, stepIdx, ticks, 1,
      step, step.pos, dist3(pos, step.pos),
      segStartFor(stepIdx), step.pos,
    );
  };

  // Recovery: fly back to the step's start anchor and re-run the same gate. The
  // anchor is a plain proximity waypoint (threshold), so planner_wp reports
  // arrival via statusReturn. segEnd is the anchor so cross-track error, which
  // only accrues in PHASE_NAVIGATE, ignores the fly-back entirely.
  const restartStep = (stepIdx: number, ticks: number, pos: Vec3): MissionOut => {
    const anchor: Vec3 = segStartFor(stepIdx);
    const step: StepDef = { type: STEP_TYPE_WP, pos: anchor, threshold: K.RTH_THRESHOLD };
    return makeOut(
      PHASE_RESTART, stepIdx, ticks, 1,
      step, anchor, dist3(pos, anchor),
      steps[stepIdx].pos, anchor,
    );
  };

  const phase   = Math.round(state.phase);
  const stepIdx = Math.round(state.stepIdx);
  const ticks   = Math.round(state.ticksInPhase);

  if (phase === PHASE_ARMING) {
    if (ticks >= K.ARMING_TICKS) {
      return makeOut(PHASE_TAKEOFF, 0, 0, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
    }
    return makeOut(PHASE_ARMING, 0, ticks + 1, 0, HOME_STEP, HOME, 0);
  }

  if (phase === PHASE_TAKEOFF) {
    if (state.pos.y >= K.CRUISE_ALT - K.LAND_THRESHOLD) {
      return navigateStep(0, 0, state.pos);
    }
    return makeOut(PHASE_TAKEOFF, 0, ticks + 1, 1, HOME_STEP, HOME, dist3(state.pos, HOME));
  }

  if (phase === PHASE_NAVIGATE) {
    const step: StepDef = steps[stepIdx];
    const timedOut = step.timeout !== undefined && ticks >= step.timeout;
    const status   = timedOut ? STATUS_FAILED : Math.round(state.statusWp);

    if (status === STATUS_COMPLETED) {
      const next = stepIdx + 1;
      if (next >= steps.length) {
        return makeOut(
          PHASE_RTH, stepIdx, 0, 1,
          HOME_STEP, HOME, dist3(state.pos, HOME),
          step.pos, HOME,
        );
      }
      return navigateStep(next, 0, state.pos);
    }

    if (status === STATUS_FAILED) {
      return makeOut(
        PHASE_RTH, stepIdx, 0, 1,
        HOME_STEP, HOME, dist3(state.pos, HOME),
        step.pos, HOME,
      );
    }

    if (status === STATUS_RESTART) {
      return restartStep(stepIdx, 0, state.pos);
    }

    return navigateStep(stepIdx, ticks + 1, state.pos);
  }

  if (phase === PHASE_RESTART) {
    // Back at the start anchor (planner_wp reports COMPLETED) → re-run the gate.
    if (Math.round(state.statusReturn ?? 0) === STATUS_COMPLETED) {
      return navigateStep(stepIdx, 0, state.pos);
    }
    return restartStep(stepIdx, ticks + 1, state.pos);
  }

  if (phase === PHASE_RTH) {
    const d = dist3(state.pos, HOME);
    if (d < K.RTH_THRESHOLD) {
      return makeOut(
        PHASE_LAND, 0, 0, 1,
        LAND_STEP, LAND_PAD, dist3(state.pos, LAND_PAD),
        HOME, LAND_PAD,
      );
    }
    return makeOut(PHASE_RTH, stepIdx, ticks + 1, 1, HOME_STEP, HOME, d, steps[stepIdx].pos, HOME);
  }

  if (phase === PHASE_LAND) {
    const d = dist3(state.pos, LAND_PAD);
    if (state.pos.y < K.LAND_THRESHOLD) {
      return makeOut(PHASE_DISARMING, 0, 0, 0, LAND_STEP, LAND_PAD, d);
    }
    return makeOut(PHASE_LAND, 0, ticks + 1, 1, LAND_STEP, LAND_PAD, d, HOME, LAND_PAD);
  }

  if (phase === PHASE_DISARMING) {
    if (ticks >= K.ARMING_TICKS) {
      return makeOut(PHASE_DONE, 0, 0, 0, LAND_STEP, LAND_PAD, 0);
    }
    return makeOut(PHASE_DISARMING, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0);
  }

  // PHASE_DONE — restart
  if (ticks >= K.ARMING_TICKS) {
    return makeOut(PHASE_ARMING, 0, 0, 0, HOME_STEP, HOME, 0);
  }
  return makeOut(PHASE_DONE, 0, ticks + 1, 0, LAND_STEP, LAND_PAD, 0);
}
