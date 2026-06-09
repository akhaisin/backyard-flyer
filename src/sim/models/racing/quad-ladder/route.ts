// The quad-ladder Jacob's Ladder Switchback course — route data shared between
// the config (published into state.K.steps via the lifecycle block) and the vis
// (rendered as window gates by the windowGate plugin).
//
// Jacob's Ladder Switchback (Y=up, X=forward, Z=right).
// Five gates stand at x=LADDER_X, spaced ±GUIDE_Z in Z and climbing in Y: three
// main gates (M1/M2/M3 on the z=0 axis) interleaved with two guide gates (G1 on
// the +z side, G2 on the −z side). The drone weaves through all five in one
// continuous chain, flipping its heading between +x and −x at every gate:
//
//   M1 (12,  3,  0) going +x
//   G1 (12,  5, +4) going −x
//   M2 (12,  7,  0) going +x
//   G2 (12,  9, −4) going −x
//   M3 (12, 11,  0) going +x
//
// Gates climb GATE_SIZE/2 per transit (3→5→7→9→11), so each cturn rises while it
// turns; its mid waypoint sits at the halfway altitude (entry.y + GATE_SIZE/4).
//
// Each gate-to-gate transit is a coordinated half-circle turn:
//   The arc fits a circle in the XZ plane through [gate_entry, arc_midpoint, gate_exit].
//   Consecutive gates are GUIDE_Z apart in Z at the same X, so the circle center
//   sits at their Z-midpoint (radius = GUIDE_Z/2 = ARC_R) and the apex bulges
//   ±ARC_R in X. The apex side alternates so the heading flips +x ↔ −x each turn:
//     M1→G1 (+x exit), M2→G2 (+x exit): apex on the +x side  (LADDER_X + ARC_R)
//     G1→M2 (−x exit), G2→M3 (−x exit): apex on the −x side  (LADDER_X − ARC_R)
//
// Route: 7 steps.
//   0       WP    → WP_STAGING_BEFORE (line the drone up on the z=0 axis, +x bound)
//   1–4     CTURN × 4 weaving M1 → G1 → M2 → G2 → M3
//   5       WP    → WP_STAGING_AFTER  (clear of the ladder, past M3)
//   6       CTURN return arc WP_STAGING_AFTER → WP_STAGING_AFTER_ARC → WP_STAGING_BEFORE,
//          bowed wide in +z so the loop home flies around the ladder, not through it.
//
// NOTE: every CTURN below is currently flagged debug: 1 — flown as straight legs
// (no arc) for visual inspection of the waypoint geometry. Drop the debug flags to
// fly the real coordinated-turn arcs.

import { STEP_TYPE_WP, STEP_TYPE_CTURN } from '../../lib/quad/consts';
import type { StepDef } from '../../lib/quad/consts';

const LADDER_X   = 12;
const GATE_SIZE  = 4;
const CRUISE_ALT = 3;
const GATE_STEP  = GATE_SIZE;              // 4 m level-to-level

const GATE_Y1 = CRUISE_ALT;               //  3
const GATE_Y2 = CRUISE_ALT + GATE_STEP;   //  7
const GATE_Y3 = CRUISE_ALT + 2 * GATE_STEP; // 11

const GUIDE_Z    = GATE_SIZE;             // guide gate offset = 4 m in Z
const ARC_R      = GUIDE_Z / 2;          // half-circle radius = 2 m

type Vec3    = { x: number; y: number; z: number };
type GateDef = { center: Vec3; normal: Vec3; width: number; height: number; label?: string };

// ── Gate geometry (used by the vis to render gate frames) ─────────────────────

// Main gates: alternating normals for Jacob's Ladder Switchback.
export const GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1, z:  0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M1' },
  { center: { x: LADDER_X, y: GATE_Y2, z:  0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M2' },
  { center: { x: LADDER_X, y: GATE_Y3, z:  0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M3' },
];

// Guide gates: exit constrainers offset in Z, opposite normals to their paired main gate.
export const GUIDE_GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1 + GATE_SIZE / 2, z: +GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G1' },
  { center: { x: LADDER_X, y: GATE_Y2 + GATE_SIZE / 2, z: -GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G2' },
];

// Staging points before/after the ladder. WP_STAGING_AFTER_ARC is the apex of the
// return arc: offset wide in +z so the loop home swings around the ladder (gate
// structure spans z∈[−6,+6]) instead of cutting straight back through it.
const WP_STAGING_BEFORE: Vec3 = { x: LADDER_X - GATE_SIZE, y: GATE_Y1, z:  0 };
const WP_STAGING_AFTER: Vec3 = { x: LADDER_X + GATE_SIZE, y: GATE_Y3, z:  0 };
const WP_STAGING_AFTER_ARC: Vec3 =  { x: LADDER_X, y: (GATE_Y1 + GATE_Y3) / 2, z: GUIDE_Z + GATE_SIZE }; // (12, 7, +8)

// ── Gate waypoints (CTURN arc endpoints) ──────────────────────────────────────
//
// The drone climbs the ladder continuously: each gate sits GATE_SIZE/2 above the
// previous one, so the five flight altitudes are a smooth staircase 3 → 5 → 7 →
// 9 → 11. Main gates (M) stay on their level; guide-gate waypoints (G) sit at the
// guide gate's center, GATE_SIZE/2 above their level's main gate.
const M1: Vec3 = { x: LADDER_X, y: GATE_Y1,                  z:  0 };       // (12,  3, 0) — arc entry L1
const G1: Vec3 = { x: LADDER_X, y: GATE_Y1 + GATE_SIZE / 2,  z: +GUIDE_Z }; // (12,  5, +4) — guide gate #1 center
const M2: Vec3 = { x: LADDER_X, y: GATE_Y2,                  z:  0 };       // (12,  7, 0) — main gate #2 center
const G2: Vec3 = { x: LADDER_X, y: GATE_Y2 + GATE_SIZE / 2,  z: -GUIDE_Z }; // (12,  9, -4) — guide gate #2 center
const M3: Vec3 = { x: LADDER_X, y: GATE_Y3,                  z:  0 };       // (12, 11, 0) — main gate #3 center


// Arc apex midpoints: the X-extreme of each gate-to-gate half-circle, at the
// halfway altitude of the cturn's climb (entry.y + GATE_SIZE/4). Only X/Z drive
// the circle fit; Y carries the climb. Consecutive gates are GUIDE_Z apart in Z
// at the same X, so the apex is at (LADDER_X ± ARC_R, ·, ±ARC_R).
const MID_M1_G1: Vec3 = { x: LADDER_X + ARC_R, y: M1.y + GATE_SIZE / 4, z: +ARC_R }; // (14,  4,  2)
const MID_G1_M2: Vec3 = { x: LADDER_X - ARC_R, y: G1.y + GATE_SIZE / 4, z: +ARC_R }; // (10,  6,  2)
const MID_M2_G2: Vec3 = { x: LADDER_X + ARC_R, y: M2.y + GATE_SIZE / 4, z: -ARC_R }; // (14,  8, -2)
const MID_G2_M3: Vec3 = { x: LADDER_X - ARC_R, y: G2.y + GATE_SIZE / 4, z: -ARC_R }; // (10, 10, -2)

// Arc duration: semicircle of radius ARC_R = 2 m → arc length = π·2 ≈ 6.28 m.
// At 40 ticks × 0.05 s/tick = 2 s → v ≈ 3.14 m/s → bank angle ≈ 27°.
const CTURN_TICKS = 40;

// ── Route ─────────────────────────────────────────────────────────────────────
//
// 7 steps: WP in, four weaving CTURNs through the five gates, WP out, return CTURN.
//
//   0      WP    → WP_STAGING_BEFORE
//   1      CTURN M1 → G1   (+x apex)
//   2      CTURN G1 → M2   (−x apex)
//   3      CTURN M2 → G2   (+x apex)
//   4      CTURN G2 → M3   (−x apex)
//   5      WP    → WP_STAGING_AFTER
//   6      CTURN return arc back to WP_STAGING_BEFORE

export const QUAD_LADDER_ROUTE: StepDef[] = [

  // Line up on the z=0 axis just short of M1, travelling +x.
  { type: STEP_TYPE_WP, pos: WP_STAGING_BEFORE, threshold: 1.0 },

  // ── Weave the five gates: M1 → G1 → M2 → G2 → M3 ───────────────────────
  // Each CTURN is a half-circle flipping heading +x ↔ −x between two gates.
  { // M1 (+x) → arc right → G1 (−x)
    type:          STEP_TYPE_CTURN,
    pos:           G1,
    waypoints:     [M1, MID_M1_G1, G1],
    durationTicks: CTURN_TICKS,
    debug:         1,
  },
  { // G1 (−x) → arc left → M2 (+x)
    type:          STEP_TYPE_CTURN,
    pos:           M2,
    waypoints:     [G1, MID_G1_M2, M2],
    durationTicks: CTURN_TICKS,
    debug:         1,
  },
  { // M2 (+x) → arc right → G2 (−x)
    type:          STEP_TYPE_CTURN,
    pos:           G2,
    waypoints:     [M2, MID_M2_G2, G2],
    durationTicks: CTURN_TICKS,
    debug:         1,
  },
  { // G2 (−x) → arc left → M3 (+x)
    type:          STEP_TYPE_CTURN,
    pos:           M3,
    waypoints:     [G2, MID_G2_M3, M3],
    durationTicks: CTURN_TICKS,
    debug:         1,
  },

  // ── Exit past the ladder, then loop home around it (apex bowed wide in +z) ──
  { type: STEP_TYPE_WP, pos: WP_STAGING_AFTER, threshold: 1.0 },
  {
    type:          STEP_TYPE_CTURN,
    pos:           WP_STAGING_BEFORE,
    waypoints:     [WP_STAGING_AFTER, WP_STAGING_AFTER_ARC, WP_STAGING_BEFORE],
    durationTicks: CTURN_TICKS * 3,
    debug:         1,
  },

];
