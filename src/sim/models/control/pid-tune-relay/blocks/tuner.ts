// Relay-feedback auto-tuner (Åström-Hägglund, 1984).
//
// On a "Tune Now" click the block temporarily replaces the PID's output
// with a bang-bang relay (±RELAY_D, sign determined by error). The plant
// enters a sustained limit cycle. We measure:
//   - Tu : limit-cycle period (time between zero-crossings of error)
//   - a  : limit-cycle amplitude (half of peak-to-peak plant output swing)
// And recover the ultimate gain via describing-function approximation:
//   Ku = 4·d / (π·a)
// Then apply the classic Ziegler-Nichols rule:
//   kp = 0.6·Ku
//   ki = 1.2·Ku / Tu
//   kd = 0.075·Ku·Tu
//
// State machine:
//   idle ──(tune button)──▶ tuning ──(N half-cycles)──▶ idle (gains updated)
//                                  └──(timeout)────────▶ idle (no update)
//
// While idle the block just passes the PID's `control_in` through to
// `control_out`. The vis picks up the (kp_new, ki_new, kd_new) the moment
// `tuning` transitions back to 0 and copies them into the controller's
// slider inputs, so the new gains visibly snap into place.

type TunerLocal = {
  // Current measurements
  y: number;             // plant.out (last tick)
  control_in: number;    // controller.control (PID output from this tick)
  target: number;        // current setpoint

  // Inputs
  tune_signal: number;        // arbitrary value from the Tune Now button
  last_tune_signal: number;   // edge-detection: any change starts a tune run

  // Tuning state machine
  tuning: number;             // 0 = idle, 1 = active relay experiment
  relay_sign: number;         // current relay direction (+1 or −1)
  cycle_count: number;        // half-cycles observed since tune started
  last_cross_t: number;       // t at last zero-crossing
  start_t: number;            // t when tuning started
  t: number;                  // internal time counter
  period_sum: number;         // accumulator for averaged period
  amp_sum: number;            // accumulator for averaged amplitude
  peak_high: number;          // running max of y within current half-cycle
  peak_low: number;           // running min of y within current half-cycle

  // Identified parameters + suggested gains (latest from completed tune)
  ku: number;
  tu: number;
  kp_new: number;
  ki_new: number;
  kd_new: number;
};

type TunerOut = TunerLocal & { control_out: number };

const DT = 0.05;
const RELAY_D = 2.0;        // relay amplitude (units of plant input)
const SKIP_CYCLES = 1;      // half-cycles to skip while the limit cycle settles
const TARGET_CYCLES = 4;    // measured half-cycles after the skip
const MAX_TUNE_TIME = 30.0; // failsafe — abort after 30 s if no oscillation

export function tuner(local: TunerLocal): TunerOut {
  const start_tuning = local.tune_signal !== local.last_tune_signal;

  let tuning = local.tuning;
  let relay_sign = local.relay_sign;
  let cycle_count = local.cycle_count;
  let last_cross_t = local.last_cross_t;
  let start_t = local.start_t;
  let period_sum = local.period_sum;
  let amp_sum = local.amp_sum;
  let peak_high = local.peak_high;
  let peak_low = local.peak_low;
  let ku = local.ku;
  let tu = local.tu;
  let kp_new = local.kp_new;
  let ki_new = local.ki_new;
  let kd_new = local.kd_new;

  const t_now = local.t + DT;

  if (start_tuning) {
    tuning = 1;
    cycle_count = 0;
    period_sum = 0;
    amp_sum = 0;
    last_cross_t = t_now;
    start_t = t_now;
    peak_high = local.y;
    peak_low = local.y;
    relay_sign = (local.target - local.y >= 0) ? 1 : -1;
  }

  if (tuning > 0.5) {
    const error = local.target - local.y;
    peak_high = Math.max(peak_high, local.y);
    peak_low = Math.min(peak_low, local.y);

    const want_sign = error >= 0 ? 1 : -1;
    if (want_sign !== relay_sign) {
      // Zero-crossing of error → relay flips. Half-cycle just completed.
      const half_period = t_now - last_cross_t;
      cycle_count += 1;
      if (cycle_count > SKIP_CYCLES) {
        period_sum += 2 * half_period;
        amp_sum += (peak_high - peak_low) / 2;
      }
      last_cross_t = t_now;
      relay_sign = want_sign;
      peak_high = local.y;
      peak_low = local.y;

      if (cycle_count >= SKIP_CYCLES + TARGET_CYCLES) {
        // Done — compute Ku, Tu and the Ziegler-Nichols gains.
        const Tu = period_sum / TARGET_CYCLES;
        const a = Math.max(amp_sum / TARGET_CYCLES, 0.01);
        const Ku = 4 * RELAY_D / (Math.PI * a);
        ku = Ku;
        tu = Tu;
        kp_new = clamp(0.6 * Ku, 0, 10);
        ki_new = clamp(1.2 * Ku / Tu, 0, 5);
        kd_new = clamp(0.075 * Ku * Tu, 0, 5);
        tuning = 0;
      }
    }

    if (t_now - start_t > MAX_TUNE_TIME) {
      tuning = 0;   // failsafe: abort if nothing converged
    }
  }

  // Output to plant: relay output during tuning, PID passthrough otherwise.
  const control_out = (tuning > 0.5) ? relay_sign * RELAY_D : local.control_in;

  return {
    y: local.y,
    control_in: local.control_in,
    target: local.target,
    tune_signal: local.tune_signal,
    last_tune_signal: local.tune_signal,
    tuning, relay_sign, cycle_count,
    last_cross_t, start_t,
    t: t_now,
    period_sum, amp_sum,
    peak_high, peak_low,
    ku, tu,
    kp_new, ki_new, kd_new,
    control_out,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
