// Canonical tunable constants for the quad block library.
//
// This is the single source of truth for every *tunable* number shared by the
// quad blocks (gains, limits, frame geometry). Protocol enums (PHASE_*,
// STATUS_*) are NOT here — those are a contract between blocks, not knobs, and
// stay as in-block constants.
//
// At runtime these values reach blocks as data, never as imports: a `params`
// block publishes them to `state.K` and each block reads `state.K.*` via its
// mapStateIn. (Edited blocks are compiled with imports stripped, so a block can
// never `import` a const — see engine/stripTypes.ts.) A model overrides any
// subset per simulation instance through createConfig(overrides).

export type Vec3 = { x: number; y: number; z: number };

// A navigate waypoint. The mission route is an ordered list of these; it lives
// in the same params bag as the scalars (config-driven, UI-editable) and reaches
// mission via state.K.steps.
export type StepDef = { pos: Vec3; threshold: number; timeout?: number };

// A type alias (not interface) so it carries an implicit string index
// signature — required for the bag to be assignable to the engine's ModelState
// when the params block publishes it.
export type QuadConsts = {
  // ── Simulation / frame (shared by world, hw, fc_acro, navigator_wp) ──
  DT: number;                  // tick duration (s)
  MASS: number;                // airframe mass (kg)
  GRAVITY: number;             // m/s²
  MAX_THRUST_N: number;        // per-motor max thrust (N); FC, hw and nav must agree
  ARM: number;                 // motor moment arm (m)
  K_DRAG: number;              // yaw drag coefficient
  I_XX: number;                // roll inertia
  I_YY: number;                // yaw inertia
  I_ZZ: number;                // pitch inertia
  GROUND_DAMP: number;         // velocity/attitude damping on ground contact

  // ── Rate limits (shared: navigator_wp normalizes, fc_acro inverts) ──
  MAX_RATE_ROLL_PITCH: number; // rad/s at stick = ±1
  MAX_RATE_YAW: number;        // rad/s at stick = ±1

  // ── fc_acro (inner rate loop) ──
  KP_RATE: number;
  KP_RATE_YAW: number;

  // ── navigator_wp (outer cascade) ──
  KP_POS: number;
  KI_POS: number;
  KD_POS: number;
  MAX_INT_POS: number;
  KP_ATT_OUTER: number;
  KP_YAW_OUTER: number;
  MAX_TILT: number;

  // ── hw (motor spool-up) ──
  THRUST_RATE_N_PER_S: number;

  // ── planner_wp ──
  LOOKAHEAD: number;
  MAX_YAW_RATE: number;
  YAW_FREEZE_RANGE: number;

  // ── validator ──
  PASS_AVG_ERR_LIMIT: number;

  // ── mission ──
  CRUISE_ALT: number;
  ARMING_TICKS: number;
  RTH_THRESHOLD: number;
  LAND_THRESHOLD: number;
};

// The full per-instance params bag published to state.K: shared scalar tunables
// plus the model's route. Scalars are shared across quad models (QUAD_DEFAULTS);
// the route is model-specific and supplied by each model's config.
export type QuadParams = QuadConsts & { steps: StepDef[] };

export const QUAD_DEFAULTS: QuadConsts = {
  DT: 0.05,
  MASS: 1.0,
  GRAVITY: 9.81,
  MAX_THRUST_N: 10,
  ARM: 0.2,
  K_DRAG: 0.02,
  I_XX: 0.01,
  I_YY: 0.02,
  I_ZZ: 0.01,
  GROUND_DAMP: 0.7,

  MAX_RATE_ROLL_PITCH: Math.PI,
  MAX_RATE_YAW: Math.PI / 2,

  KP_RATE: 0.05,
  KP_RATE_YAW: 0.012,

  KP_POS: 2.0,
  KI_POS: 0.3,
  KD_POS: 1.5,
  MAX_INT_POS: 15.0,
  KP_ATT_OUTER: 40.0,
  KP_YAW_OUTER: 10.0,
  MAX_TILT: 0.6,

  THRUST_RATE_N_PER_S: 40,

  LOOKAHEAD: 3.0,
  MAX_YAW_RATE: Math.PI / 2,
  YAW_FREEZE_RANGE: 2.0,

  PASS_AVG_ERR_LIMIT: 2.0,

  CRUISE_ALT: 5,
  ARMING_TICKS: 20,
  RTH_THRESHOLD: 1.2,
  LAND_THRESHOLD: 0.3,
};
