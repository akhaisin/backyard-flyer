// The quad-ladder Jacob's Ladder Switchback course — route data shared between
// the config (published into state.K.steps via the lifecycle block) and the vis
// (rendered as window gates by the windowGate plugin).
//
// Jacob's Ladder Switchback (Y=up, X=forward, Z=right).
// Three pairs of gates stacked vertically. Each pair is a main gate (M) + a guide
// gate (G) that constrains the exit arc. The drone weaves through the structure
// climbing one level per pass:
//
//   Level 1 (y=3): M1 going +x, arc right, G1 going −x
//   Level 2 (y=7): M2 going −x, arc left,  G2 going +x
//   Level 3 (y=11):M3 going +x, arc right, G3 going −x
//
// Each gate pair is flown as a coordinated half-circle turn:
//   The arc fits a circle through [gate_entry, arc_midpoint, gate_exit].
//   Center of circle is at the midpoint between the two gate centers in Z (radius = GUIDE_Z/2).
//   CCW arcs in the XZ plane (positive sweep direction = atan increasing):
//     M1/M3 arcs: rightward (+x),  center.x = LADDER_X,        midpoint at LADDER_X + ARC_R
//     M2 arc:     leftward  (−x),  center.x = LADDER_X,        midpoint at LADDER_X − ARC_R
//
// Approach geometry (aligns drone on the correct axis before each CTURN entry):
//   After takeoff:      HOME → M1  along z=0 axis (+x travel), approach is pure +x  ✓
//   After Level-1 arc:  stage at (LADDER_X+APPROACH_X, GATE_Y2, 0) → M2 approach is pure −x ✓
//   After Level-2 arc:  stage at (LADDER_X−APPROACH_X, GATE_Y3, 0) → M3 approach is pure +x ✓
//
// Route: 8 steps — [WP_entry, CTURN] × 3 levels, with inter-level staging WPs.

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
const APPROACH_X = 7;                    // staging distance from ladder face

type Vec3    = { x: number; y: number; z: number };
type GateDef = { center: Vec3; normal: Vec3; width: number; height: number; label?: string };

// ── Gate geometry (used by the vis to render gate frames) ─────────────────────

// Main gates: alternating normals for Jacob's Ladder Switchback.
export const GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1, z:  0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M1' },
  { center: { x: LADDER_X, y: GATE_Y2, z:  0 }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M2' },
  { center: { x: LADDER_X, y: GATE_Y3, z:  0 }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'M3' },
];

// Guide gates: exit constrainers offset in Z, opposite normals to their paired main gate.
export const GUIDE_GATES: GateDef[] = [
  { center: { x: LADDER_X, y: GATE_Y1, z: +GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G1' },
  { center: { x: LADDER_X, y: GATE_Y2, z: -GUIDE_Z }, normal: { x: +1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G2' },
  { center: { x: LADDER_X, y: GATE_Y3, z: +GUIDE_Z }, normal: { x: -1, y: 0, z: 0 }, width: GATE_SIZE, height: GATE_SIZE, label: 'G3' },
];

// ── Gate waypoints (CTURN arc endpoints) ──────────────────────────────────────

const M1: Vec3 = { x: LADDER_X, y: GATE_Y1, z:  0 };       // M1 center — arc entry L1
const G1: Vec3 = { x: LADDER_X, y: GATE_Y1, z: +GUIDE_Z }; // G1 center — arc exit  L1
const M2: Vec3 = { x: LADDER_X, y: GATE_Y2, z:  0 };       // M2 center — arc entry L2
const G2: Vec3 = { x: LADDER_X, y: GATE_Y2, z: -GUIDE_Z }; // G2 center — arc exit  L2
const M3: Vec3 = { x: LADDER_X, y: GATE_Y3, z:  0 };       // M3 center — arc entry L3
const G3: Vec3 = { x: LADDER_X, y: GATE_Y3, z: +GUIDE_Z }; // G3 center — arc exit  L3

// Arc midpoints: rightmost/leftmost point of each half-circle.
// Circle center is at (LADDER_X, y, ±ARC_R); midpoint is at (LADDER_X ± ARC_R, y, ±ARC_R).
const M1_MID: Vec3 = { x: LADDER_X + ARC_R, y: GATE_Y1, z: +ARC_R }; // (14, 3,  2)
const M2_MID: Vec3 = { x: LADDER_X - ARC_R, y: GATE_Y2, z: -ARC_R }; // (10, 7, -2)
const M3_MID: Vec3 = { x: LADDER_X + ARC_R, y: GATE_Y3, z: +ARC_R }; // (14, 11, 2)

// Staging waypoints: align the drone on the gate approach axis (z=0 line) before
// each WP_ENTRY, so the final leg into the CTURN entry is a clean axial approach.
const STAGE_M2: Vec3 = { x: LADDER_X + APPROACH_X, y: GATE_Y2, z: 0 }; // right side (19, 7, 0)
const STAGE_M3: Vec3 = { x: LADDER_X - APPROACH_X, y: GATE_Y3, z: 0 }; // left side  (5, 11, 0)

// Arc duration: semicircle of radius ARC_R = 2 m → arc length = π·2 ≈ 6.28 m.
// At 40 ticks × 0.05 s/tick = 2 s → v ≈ 3.14 m/s → bank angle ≈ 27°.
const CTURN_TICKS = 40;

// ── Route ─────────────────────────────────────────────────────────────────────
//
// Step pattern: [WP_entry → CTURN] × 3 levels, with inter-level staging WPs.
//
// Steps 0–1  → Level 1 (gate index 0: M1 / G1)
// Steps 2–4  → Level 2 (gate index 1: M2 / G2)   (staging, entry, arc)
// Steps 5–7  → Level 3 (gate index 2: M3 / G3)   (staging, entry, arc)

export const QUAD_LADDER_ROUTE: StepDef[] = [
  // ── Level 1 (y = 3): M1 going +x → arc right → G1 going −x ──────────────
  // Drone arrives at M1 straight from HOME (0,3,0) along the +x axis.
  { type: STEP_TYPE_WP, pos: M1, threshold: 1.0 },
  {
    type:          STEP_TYPE_CTURN,
    pos:           G1,
    waypoints:     [M1, M1_MID, G1],
    durationTicks: CTURN_TICKS,
  },

  // ── Level 2 (y = 7): M2 going −x → arc left → G2 going +x ───────────────
  // After L1 arc exits at G1 (going −x), stage right to align the M2 approach.
  { type: STEP_TYPE_WP, pos: STAGE_M2, threshold: 1.5 },
  { type: STEP_TYPE_WP, pos: M2, threshold: 1.0 },
  {
    type:          STEP_TYPE_CTURN,
    pos:           G2,
    waypoints:     [M2, M2_MID, G2],
    durationTicks: CTURN_TICKS,
  },

  // ── Level 3 (y = 11): M3 going +x → arc right → G3 going −x ─────────────
  // After L2 arc exits at G2 (going +x), stage left to align the M3 approach.
  { type: STEP_TYPE_WP, pos: STAGE_M3, threshold: 1.5 },
  { type: STEP_TYPE_WP, pos: M3, threshold: 1.0 },
  {
    type:          STEP_TYPE_CTURN,
    pos:           G3,
    waypoints:     [M3, M3_MID, G3],
    durationTicks: CTURN_TICKS,
  },
];
