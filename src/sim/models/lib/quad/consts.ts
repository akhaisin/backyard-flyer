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

// A navigate step. The mission route is an ordered list of these; it lives in
// the same params bag as the scalars (config-driven, UI-editable) and reaches
// mission via state.K.steps.
//
// Four variants, discriminated by numeric `type` (numeric so steps remain
// compatible with ModelState, which restricts values to number|object|null):
//   • STEP_TYPE_WP    (0) — proximity completion (planner_wp). `threshold` is
//     the completion radius; mission reads `pos` for steering.
//   • STEP_TYPE_W1A   (1) — carrot gate crossing (planner_w1a / navigator_w1).
//     `normal` is the unit travel direction, `width`/`height` the frame size.
//   • STEP_TYPE_W1B   (2) — pre-stage gate crossing (planner_w1b / navigator_w1).
//     Same geometry as W1A plus `preStageDist`: planner_w1b stages a waypoint
//     that far behind the gate before committing to the frame.
//   • STEP_TYPE_RATES (3) — time-based completion (planner_rates). `duration` is
//     the tick budget; throttle/yaw/pitch/roll are interpolated by navigator_rates.
//
// `timeout` is an optional NAVIGATE tick budget any variant can carry; mission
// treats it as a FAILED override when ticksInPhase reaches it.
export type RateRange = { start: number; end: number };

export const STEP_TYPE_WP    = 0 as const;
export const STEP_TYPE_W1A   = 1 as const;
export const STEP_TYPE_W1B   = 2 as const;
export const STEP_TYPE_RATES = 3 as const;
export const STEP_TYPE_CTURN = 4 as const;

export type WpStep = {
  type: typeof STEP_TYPE_WP;
  pos: Vec3;
  threshold: number;
  timeout?: number;
};

export type W1aStep = {
  type: typeof STEP_TYPE_W1A;
  pos: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  timeout?: number;
};

export type W1bStep = {
  type: typeof STEP_TYPE_W1B;
  pos: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  preStageDist: number;
  timeout?: number;
};

export type RatesStep = {
  type: typeof STEP_TYPE_RATES;
  pos: Vec3;
  duration: number;
  throttle: RateRange;
  yaw: RateRange;
  pitch: RateRange;
  roll: RateRange;
  timeout?: number;
};

export type CTurnStep = {
  type: typeof STEP_TYPE_CTURN;
  pos: Vec3;
  waypoints: Vec3[];
  durationTicks: number;
  timeout?: number;
};

// Convenience alias for code that handles either gate style.
export type WindowStep = W1aStep | W1bStep;

export type StepDef = WpStep | W1aStep | W1bStep | RatesStep | CTurnStep;

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

  // ── Rate limits (shared: navigators normalize desired body rates; fc_acro
  //     denormalizes the same bus back to rad/s) ──
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
  YAW_MEAS_LPF: number;        // EMA factor (0..1) low-passing the yaw measurement; 1 = off
  MAX_TILT: number;

  // ── planner_w1a (gate path planner) ──
  LOOKAHEAD: number;           // pure-pursuit carrot distance ahead along the gate centerline
  MAX_YAW_RATE: number;        // yaw setpoint slew cap (rad/s)
  YAW_SLEW_LPF: number;        // first-order smoothing on the yaw setpoint (0..1; 1 = off)

  // ── hw (motor spool-up) ──
  THRUST_RATE_N_PER_S: number;

  // ── noise (sensor noise model: Gaussian std-dev per channel) ──
  POS_STD: number;
  VEL_STD: number;
  ATT_STD: number;
  ANG_VEL_STD: number;

  // ── wind (gust generator) ──
  WIND_FORCE_INITIAL_PCT: number;    // first gust season only; lets the quad stabilize
  WIND_FORCE_MAX_PCT: number;        // max gust strength as % of WIND_MAX_N
  WIND_MAX_N: number;                // 100% wind scale in Newtons
  WIND_DURATION_MIN_TICKS: number;   // minimum gust duration
  WIND_DURATION_MAX_TICKS: number;   // maximum gust duration

  // ── mission ──
  CRUISE_ALT: number;
  ARMING_TICKS: number;
  RTH_THRESHOLD: number;
  LAND_THRESHOLD: number;
  HOME_X: number;        // home/land-pad XZ (default 0,0 = origin); offset-track models override
  HOME_Z: number;

  // ── simulation lifecycle + pass/fail criteria (lifecycle.after → simTest) ──
  // Run length in ticks: lifecycle.after stops the sim once tick >= simDuration.
  simDuration: number;
  // Pass criteria. MAX_TICKS is the duration pass-condition (tick <= MAX_TICKS),
  // kept distinct from simDuration (the hard stop) so the budget can be tighter
  // than the run length.
  MAX_TICKS: number;
  REQUIRED_LAPS: number;   // completed laps needed to pass (lapsTotal >= this)
  ACC_ERR_LIMIT: number;   // accumulated cross-track error (IAE) must be < this
  MAX_RESTARTS: number;    // window-gate restarts allowed; -1 = N/A (check skipped)
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
  MAX_RATE_YAW: 2 * Math.PI,

  KP_RATE: 0.2,
  KP_RATE_YAW: 0.15,

  KP_POS: 2.0,
  KI_POS: 0,
  KD_POS: 1.5,
  MAX_INT_POS: 15.0,
  KP_ATT_OUTER: 10.0,
  KP_YAW_OUTER: 10.0,
  YAW_MEAS_LPF: 1.0,     // no yaw-measurement filtering by default; window models opt in
  MAX_TILT: 0.3,

  // planner_w1a (gate path planner; only the window models read these)
  LOOKAHEAD: 4.0,
  MAX_YAW_RATE: Math.PI / 2,
  YAW_SLEW_LPF: 0.2,

  THRUST_RATE_N_PER_S: 40,

  // Sensor noise std-devs (halved from the original inline noise-block values).
  POS_STD:     0.005,
  VEL_STD:     0.005,
  ATT_STD:     0.0,
  ANG_VEL_STD: 0.0,

  WIND_FORCE_INITIAL_PCT: 0,
  WIND_FORCE_MAX_PCT: 20,
  WIND_MAX_N: 4,
  WIND_DURATION_MIN_TICKS: 100,
  WIND_DURATION_MAX_TICKS: 300,

  CRUISE_ALT: 5,
  ARMING_TICKS: 20,
  RTH_THRESHOLD: 1.2,
  LAND_THRESHOLD: 0.3,
  HOME_X: 0,
  HOME_Z: 0,

  // Calibrated headless against the simplified planner: ~370 ticks/lap and
  // ~570 accumulated XTE/lap. A clean 5-lap run finishes near ~1800 ticks /
  // ~2300 accErr. The run early-stops when REQUIRED_LAPS is reached, so the
  // final tick reflects how long the laps took.
  REQUIRED_LAPS: 5,
  MAX_TICKS: 2000,       // duration pass-budget: 5 laps should finish under this
  ACC_ERR_LIMIT: 1000,   // accumulated XTE (IAE) ceiling (clean run ~2300)
  MAX_RESTARTS: -1,      // N/A for waypoint courses; window models override with a real budget
  simDuration: 4000,     // hard cap — only fires if the run never makes 5 laps
};
