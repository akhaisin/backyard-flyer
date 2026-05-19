type SetpointLocal = {
  target: number | null;
  plant_out: number;
};

type SetpointOut = {
  signal_error: number;
};

export function setpoint(local: SetpointLocal): SetpointOut {
  const target = local.target ?? 1.0;
  return { signal_error: target - local.plant_out };
}
