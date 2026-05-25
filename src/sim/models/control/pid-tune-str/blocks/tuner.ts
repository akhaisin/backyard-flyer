// Self-Tuning Regulator (STR) for the PID gains.
//
// Two ideas combined:
//   1. SYSTEM IDENTIFICATION via Recursive Least Squares (RLS) on an ARX(2,1)
//      model:    y[k] = a1·y[k-1] + a2·y[k-2] + b1·u[k-1]
//      This is the exact discrete form of m·ÿ + β·ẏ = u (Euler).
//      From the identified coefficients we recover physical parameters:
//          m̂ = dt² / b1
//          β̂ = (2 − a1) · dt / b1
//   2. POLE PLACEMENT design. Closed-loop characteristic polynomial of the
//      mass-damper + PID is  m·s³ + (β+kd)·s² + kp·s + ki .
//      Matching m·(s+ω)³ = m·(s³ + 3ω·s² + 3ω²·s + ω³) gives:
//          kp = 3·m̂·ω²
//          ki = m̂·ω³
//          kd = 3·m̂·ω − β̂
//
// AUTO/MANUAL switch: when `enabled` is 0 the tuner FREEZES system
// identification (theta, covariance, regression history all stationary).
// The STR recommendation shown in the tuner box reflects the last estimate
// from when AUTO was active. The OUTPUT gains pass through the manual
// slider values. RLS resumes immediately the next time AUTO is enabled.
//
// Why freeze in MANUAL: while RLS is identifying the *plant*, the data it
// sees comes from a closed loop driven by whatever gains the controller is
// currently using. In MANUAL mode the user can perturb the system (drag
// setpoint, hand-tune gains) in ways that produce poorly-conditioned data,
// which can drag RLS toward a spurious estimate. Freezing avoids that drift.

type TunerLocal = {
  // Current measurements (read from state via mapStateIn)
  y: number;     // current plant.out
  u: number;     // current controller.control

  // Switch (1 = STR active, 0 = passthrough manual gains)
  enabled: number;

  // Re-tune edge detector. The vis writes a timestamp to `retune_signal` on
  // each button click; whenever it differs from `last_retune_signal` we
  // reset the covariance matrix so RLS re-identifies from scratch.
  retune_signal: number;
  last_retune_signal: number;

  // Manual gain values from PID sliders (used when enabled = 0)
  kp_manual: number;
  ki_manual: number;
  kd_manual: number;

  // ARX parameter estimates
  a1: number; a2: number; b1: number;

  // RLS covariance matrix (3x3, stored as 9 numbers)
  p00: number; p01: number; p02: number;
  p10: number; p11: number; p12: number;
  p20: number; p21: number; p22: number;

  // Regression history
  y_lag1: number; y_lag2: number; u_lag1: number;

  // Identified plant params (derived from ARX)
  m_hat: number; beta_hat: number;

  // STR-derived gains (what AUTO mode would apply). Always computed, so the
  // tuner box can show them even in MANUAL mode.
  kp_str: number; ki_str: number; kd_str: number;

  // Currently applied PID gains (what the controller reads).
  // = STR values in AUTO, = manual values in MANUAL.
  kp: number; ki: number; kd: number;
};

type TunerOut = TunerLocal;

const DT = 0.05;
const LAMBDA = 0.995;  // RLS forgetting factor — closer to 1 = slower drift.
                       //   0.99  ≈ 5 s of effective history (transient-sensitive)
                       //   0.995 ≈ 10 s
                       //   0.999 ≈ 50 s (very stable but slow to track changes)
const OMEGA = 1.0;     // Desired closed-loop pole frequency (rad/s)

export function tuner(local: TunerLocal): TunerOut {
  const auto = local.enabled > 0.5;
  const retune_now = local.retune_signal !== local.last_retune_signal;

  let a1: number, a2: number, b1: number;
  let p00: number, p01: number, p02: number;
  let p10: number, p11: number, p12: number;
  let p20: number, p21: number, p22: number;
  let y_lag1: number, y_lag2: number, u_lag1: number;

  if (retune_now) {
    // ── Covariance reset ─────────────────────────────────────────────────
    // Keep current theta (it represents whatever RLS believes about the
    // plant). Blast P back to the initial 1000·I — that tells RLS the
    // estimate is now highly uncertain, so the next several ticks of
    // (u, y) data will move θ aggressively. Lags are also reset to current
    // measurements so the regressor isn't carrying stale values from
    // possibly-frozen MANUAL ticks.
    a1 = local.a1; a2 = local.a2; b1 = local.b1;
    p00 = 1000; p01 = 0;    p02 = 0;
    p10 = 0;    p11 = 1000; p12 = 0;
    p20 = 0;    p21 = 0;    p22 = 1000;
    y_lag1 = local.y; y_lag2 = local.y; u_lag1 = local.u;
  } else if (auto) {
    // ── 1. System ID via RLS — only when AUTO is on ───────────────────────
    // Regressor φ = [y[k-1], y[k-2], u[k-1]]ᵀ
    const f0 = local.y_lag1;
    const f1 = local.y_lag2;
    const f2 = local.u_lag1;

    const y_pred = local.a1 * f0 + local.a2 * f1 + local.b1 * f2;
    const err = local.y - y_pred;

    const Pf0 = local.p00 * f0 + local.p01 * f1 + local.p02 * f2;
    const Pf1 = local.p10 * f0 + local.p11 * f1 + local.p12 * f2;
    const Pf2 = local.p20 * f0 + local.p21 * f1 + local.p22 * f2;

    const denom = LAMBDA + f0 * Pf0 + f1 * Pf1 + f2 * Pf2;

    const K0 = Pf0 / denom;
    const K1 = Pf1 / denom;
    const K2 = Pf2 / denom;

    a1 = local.a1 + K0 * err;
    a2 = local.a2 + K1 * err;
    b1 = local.b1 + K2 * err;

    p00 = (local.p00 - K0 * Pf0) / LAMBDA;
    p01 = (local.p01 - K0 * Pf1) / LAMBDA;
    p02 = (local.p02 - K0 * Pf2) / LAMBDA;
    p10 = (local.p10 - K1 * Pf0) / LAMBDA;
    p11 = (local.p11 - K1 * Pf1) / LAMBDA;
    p12 = (local.p12 - K1 * Pf2) / LAMBDA;
    p20 = (local.p20 - K2 * Pf0) / LAMBDA;
    p21 = (local.p21 - K2 * Pf1) / LAMBDA;
    p22 = (local.p22 - K2 * Pf2) / LAMBDA;

    y_lag1 = local.y;
    y_lag2 = f0;
    u_lag1 = local.u;
  } else {
    // ── MANUAL: freeze identification ─────────────────────────────────────
    // Carry theta, P, and the regression lags forward unchanged. The
    // displayed STR recommendation will reflect whatever AUTO last estimated.
    a1 = local.a1; a2 = local.a2; b1 = local.b1;
    p00 = local.p00; p01 = local.p01; p02 = local.p02;
    p10 = local.p10; p11 = local.p11; p12 = local.p12;
    p20 = local.p20; p21 = local.p21; p22 = local.p22;
    y_lag1 = local.y_lag1; y_lag2 = local.y_lag2; u_lag1 = local.u_lag1;
  }

  // ── 2. Recover physical plant params (from frozen-or-fresh theta) ───────
  const safeB1 = Math.abs(b1) > 1e-6 ? b1 : (b1 >= 0 ? 1e-6 : -1e-6);
  const m_hat = clamp((DT * DT) / safeB1, 0.1, 10);
  const beta_hat = clamp((2 - a1) * DT / safeB1, 0, 5);

  // ── 3. STR-derived gains (pole placement at s = −OMEGA) ─────────────────
  // Output gains are clamped to the slider ranges. This breaks a runaway
  // feedback loop that can otherwise happen during setpoint transients:
  // a brief mis-estimate pushes m̂ toward its ceiling, which pushes the
  // derived kp above the slider max, which drives the controller into a
  // violent response, which keeps RLS seeing off-model data and pinning
  // m̂ at the ceiling. With output gains capped, the system stays linear
  // while RLS settles back to the true plant.
  const kp_str = clamp(3 * m_hat * OMEGA * OMEGA,                0, 10);
  const ki_str = clamp(m_hat * OMEGA * OMEGA * OMEGA,            0, 5);
  const kd_str = clamp(Math.max(0, 3 * m_hat * OMEGA - beta_hat), 0, 5);

  // ── 4. Apply STR gains or pass through manual, based on enabled flag ────
  const kp = auto ? kp_str : local.kp_manual;
  const ki = auto ? ki_str : local.ki_manual;
  const kd = auto ? kd_str : local.kd_manual;

  return {
    y: local.y, u: local.u,
    enabled: local.enabled,
    retune_signal: local.retune_signal,
    // Record the current retune_signal so the edge detector recognises
    // it as "already seen" on subsequent ticks.
    last_retune_signal: local.retune_signal,
    kp_manual: local.kp_manual, ki_manual: local.ki_manual, kd_manual: local.kd_manual,
    a1, a2, b1,
    p00, p01, p02,
    p10, p11, p12,
    p20, p21, p22,
    y_lag1, y_lag2, u_lag1,
    m_hat, beta_hat,
    kp_str, ki_str, kd_str,
    kp, ki, kd,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
