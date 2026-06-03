// Rates-based navigator — RC pilot issuing stick commands.
//
// During PHASE_NAVIGATE: linearly interpolates AETR stick values from step's
// start to end over step.duration ticks. At tick 0 sticks equal the start
// values; at tick (duration-1) they reach the end values.
//
// During all other phases (TAKEOFF, RTH, LAND): passes the incoming aetr
// through unchanged, so an upstream position navigator (navigator_wp) retains
// control for autonomous takeoff and landing.
//
// Sign conventions (fc_acro contract):
//   throttle [0, 1]   0 = off, 1 = full
//   roll    [-1, 1]   +1 = roll right
//   pitch   [-1, 1]   +1 = pitch back / nose up (NOT transmitter convention)
//   yaw     [-1, 1]   +1 = yaw right (CW from above)

type Vec3 = { x: number; y: number; z: number };
type Aetr = { throttle: number; roll: number; pitch: number; yaw: number };
type RateRange = { start: number; end: number };
type Step = {
  pos: Vec3;
  duration?: number;
  throttle?: RateRange;
  yaw?: RateRange;
  pitch?: RateRange;
  roll?: RateRange;
};

type NavIn = {
  ticksInPhase: number;
  phase: number;
  step: Step;
  armed: number;
  aetr: Aetr;
};

type NavOut = {
  aetr: Aetr;
};

const NAVIGATE = 2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function navigator_rates(state: NavIn): NavOut {
  const phase = Math.round(state.phase);
  if (!state.armed || phase !== NAVIGATE) {
    return { aetr: state.aetr };
  }

  const step = state.step;
  const duration = step.duration ?? 60;
  const t = clamp(state.ticksInPhase / Math.max(1, duration - 1), 0, 1);

  const throttle = step.throttle ?? { start: 0.5, end: 0.5 };
  const yaw      = step.yaw      ?? { start: 0,   end: 0   };
  const pitch    = step.pitch    ?? { start: 0,   end: 0   };
  const roll     = step.roll     ?? { start: 0,   end: 0   };

  return {
    aetr: {
      throttle: clamp(lerp(throttle.start, throttle.end, t), 0,  1),
      yaw:     clamp(lerp(yaw.start,    yaw.end,    t), -1, 1),
      pitch:   clamp(lerp(pitch.start,  pitch.end,  t), -1, 1),
      roll:    clamp(lerp(roll.start,   roll.end,   t), -1, 1),
    },
  };
}
