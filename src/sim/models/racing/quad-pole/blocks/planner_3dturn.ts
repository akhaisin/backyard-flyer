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
// Stick conventions match a Mode-2 transmitter:
//   thrust ∈ [0, 1]    raw throttle (≈ 0.245 = hover)
//   roll/pitch/yaw ∈ [-1, 1]    rate-stick (-1 = full negative)

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
const ROLL_LEAD      = 0.2;

// Lefthanded 2D coordinated sweep — Ch.18 Fig 18-02, 18-08, exit A from 18-09.
const SWEEP_LEFT: Maneuver = {
  name: 'sweep-left',
  duration: 5.0,
  channels: {
    roll: [
      { t: 0.0, v:  0.0 },
      { t: 0.4, v: -0.45 },
      { t: 4.2, v: -0.45 },
      { t: 4.8, v: +0.30 },
      { t: 5.0, v:  0.0 },
    ],
    pitch: [
      { t: ROLL_LEAD, v:  0.0 },
      { t: 0.8,       v: -0.20 },
      { t: 4.2,       v: -0.20 },
      { t: 5.0,       v:  0.0 },
    ],
    yaw: [
      { t: ROLL_LEAD, v:  0.0 },
      { t: 0.8,       v: -0.55 },
      { t: 4.2,       v: -0.55 },
      { t: 4.8,       v:  0.0 },
      { t: 5.0,       v:  0.0 },
    ],
    thrust: [
      { t: 0.0, v: HOVER_THROTTLE },
      { t: 0.8, v: HOVER_THROTTLE + 0.08 },
      { t: 4.2, v: HOVER_THROTTLE + 0.08 },
      { t: 4.8, v: HOVER_THROTTLE + 0.02 },
      { t: 5.0, v: HOVER_THROTTLE },
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
