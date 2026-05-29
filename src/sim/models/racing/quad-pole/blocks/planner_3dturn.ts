// 3D-turn (acro maneuver) planner: stores the maneuver library and samples the
// active maneuver at the current elapsed time. Outputs the "plan" — per-channel
// AETR values that navigator_3dturn forwards to fc_acro.
//
// Why split planner/navigator for 3D-turns? The planner owns the data (the
// keyframe library) and the temporal sampling. The navigator owns the output
// channel (writing to aetr state). This mirrors the planner_wp/navigator_wp
// pair so all mission types follow the same shape.
//
// Block convention: blocks compile via new Function() and cannot import.
// Maneuver type, sampler, and the maneuver library are all inlined here.
//
// AETR conventions (sign = direction of body-frame rate produced in *this* sim;
// derived from world.ts torque mixing — see fc_acro.ts for the inverse mapping):
//   thrust ∈ [0, 1]    raw throttle; ≈ 0.245 = hover at MASS=1, MAX_THRUST_N=10
//   roll   ∈ [-1, 1]   +1 = roll right (attitude.x positive)
//   pitch  ∈ [-1, 1]   +1 = pitch back / nose up (attitude.z positive)
//                      NOTE: opposite of typical Mode-2 elevator stick, where
//                      stick UP = nose DOWN. The internal AETR bus follows the
//                      sim's body-rate sign, not transmitter convention. A
//                      future RC-translation block can invert if needed.
//   yaw    ∈ [-1, 1]   +1 = yaw right (attitude.y positive)
//
// Rate-mode physics caveat: a stick held at deflection X for time T accumulates
// X · MAX_RATE · T radians of body rotation. There is no aerodynamic restoring
// force in world.ts, so once banked the drone STAYS banked until commanded to
// level. Maneuvers must use pulse patterns (brief deflection to establish
// attitude, then neutralize, then opposite pulse to exit) — not the "hold
// sticks throughout sweep" pattern that real-world aerodynamic equilibrium
// makes possible.

type Channel = 'thrust' | 'yaw' | 'pitch' | 'roll';
type Key     = { t: number; v: number; ease?: 'step' | 'linear' };
type Maneuver = {
  name: string;
  duration: number;
  channels: Record<Channel, Key[]>;
};

type PlannerIn = {
  missionType: number;
  maneuverIdx: number;
  ticksInPhase: number;
  armed: number;
  phase: number;
};

type PlannerOut = {
  thrust: number;
  roll: number;
  pitch: number;
  yaw: number;
  active: number;       // 1 when a maneuver is being sampled this tick
};

const DT             = 0.05;
const NAVIGATE       = 2;
const MISSION_3DTURN = 1;
const HOVER_THROTTLE = 0.245;

// Lefthanded 2D coordinated sweep — pulse-based for true rate-mode.
//   bank-in     0.05–0.35 s   roll-left pulse (≈ −13° bank accumulated)
//   hold        0.35–3.15 s   roll=0; gentle yaw-left at −0.10; throttle bumped
//   bank-out    3.20–3.50 s   roll-right pulse (cancels initial bank)
//
// Scale chosen so accumulated yaw during sweep ≈ −0.10 × π/2 × 2.6 = −0.41 rad
// (−23°). This stays modest because navigator_wp's cascade then adds whatever
// yaw is needed to re-face HOME for the RTH leg — and HOME is behind the drone
// post-maneuver, so that geometric correction is already ~180°. Adding more
// yaw in the maneuver itself just stacks on top of an already-large turn.
//
// Pitch held at zero — from a hover, banked yaw alone produces lateral motion.
// Pitch-back is for pilots already in forward flight (not our case) and would
// just climb the drone with no aerodynamic drag to counter the tilt.
const SWEEP_LEFT: Maneuver = {
  name: 'sweep-left',
  duration: 3.5,
  channels: {
    roll: [
      { t: 0.0,  v:  0.0 },
      { t: 0.05, v: -0.3 },   // bank-in pulse rises
      { t: 0.30, v: -0.3 },   // hold pulse
      { t: 0.35, v:  0.0 },   // release — bank persists at ≈ −13°
      { t: 3.15, v:  0.0 },
      { t: 3.20, v: +0.3 },   // bank-out pulse rises
      { t: 3.45, v: +0.3 },   // hold pulse
      { t: 3.50, v:  0.0 },   // release — drone level again
    ],
    pitch: [
      { t: 0.0, v: 0.0 },
      { t: 3.5, v: 0.0 },
    ],
    yaw: [
      { t: 0.0,  v:  0.0  },
      { t: 0.35, v:  0.0  },   // wait for bank to settle
      { t: 0.55, v: -0.10 },   // gentle yaw ramp-in
      { t: 3.15, v: -0.10 },   // hold yaw through sweep
      { t: 3.20, v:  0.0  },   // stop yaw before bank-out
      { t: 3.50, v:  0.0  },
    ],
    thrust: [
      { t: 0.0,  v: HOVER_THROTTLE        },
      { t: 0.35, v: HOVER_THROTTLE + 0.02 },   // compensate ≈ 13° bank
      { t: 3.15, v: HOVER_THROTTLE + 0.02 },
      { t: 3.50, v: HOVER_THROTTLE        },
    ],
  },
};

const MANEUVERS: Maneuver[] = [SWEEP_LEFT];

function sampleChannel(keys: Key[], t: number): number {
  if (keys.length === 0) return 0;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      if (b.ease === 'step') return a.v;
      const u = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * u;
    }
  }
  return keys[keys.length - 1].v;
}

export function planner_3dturn(state: PlannerIn): PlannerOut {
  const idle: PlannerOut = { thrust: 0, roll: 0, pitch: 0, yaw: 0, active: 0 };

  if (!state.armed) return idle;
  if (Math.round(state.phase) !== NAVIGATE) return idle;
  if (Math.round(state.missionType) !== MISSION_3DTURN) return idle;

  const idx = Math.round(state.maneuverIdx);
  if (idx < 0 || idx >= MANEUVERS.length) return idle;

  const m = MANEUVERS[idx];
  const t = Math.round(state.ticksInPhase) * DT;

  return {
    thrust: sampleChannel(m.channels.thrust, t),
    roll:   sampleChannel(m.channels.roll,   t),
    pitch:  sampleChannel(m.channels.pitch,  t),
    yaw:    sampleChannel(m.channels.yaw,    t),
    active: 1,
  };
}
