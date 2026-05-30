// coordinated-turn navigator — the "RC pilot" for scripted maneuvers.
//
// Trivial today: reads planner_cturn's sampled plan and writes it to aetr.
// Same role as navigator_wp but for the maneuver path. Kept as a separate
// block (rather than collapsed into planner_cturn) so the planner ↔ navigator
// split is consistent across all mission types — and so future logic (rate
// limiting, transitions between maneuvers, stick blending) has a home that
// doesn't touch the maneuver library.
//
// When the planner reports inactive, this block passes through the current
// aetr unchanged — letting navigator_wp's value (or any earlier writer) stand.

type Aetr = { thrust: number; roll: number; pitch: number; yaw: number };

type NavIn = {
  planThrust: number;
  planRoll:   number;
  planPitch:  number;
  planYaw:    number;
  planActive: number;
  aetr: Aetr;
};

type NavOut = { aetr: Aetr };

export function navigator_cturn(state: NavIn): NavOut {
  if (Math.round(state.planActive) !== 1) {
    return { aetr: state.aetr };
  }
  return {
    aetr: {
      thrust: state.planThrust,
      roll:   state.planRoll,
      pitch:  state.planPitch,
      yaw:    state.planYaw,
    },
  };
}
