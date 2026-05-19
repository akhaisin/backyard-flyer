type ControllerLocal = {
  kp: number | null;
  ki: number | null;
  kd: number | null;
  error: number;
  integral: number;
  prev_error: number;
};

type ControllerOut = {
  control: number;
  integral: number;
  prev_error: number;
};

const DT = 0.05;

export function controller(local: ControllerLocal): ControllerOut {
  const kp = local.kp ?? 1.0;
  const ki = local.ki ?? 0.0;
  const kd = local.kd ?? 0.0;
  const integral = local.integral + local.error * DT;
  const derivative = (local.error - local.prev_error) / DT;
  const control = kp * local.error + ki * integral + kd * derivative;
  return { control, integral, prev_error: local.error };
}
