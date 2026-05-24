type IncState = { value: number };

export function l1(state: IncState): IncState {
  return { value: state.value + 1 };
}
