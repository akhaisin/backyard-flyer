// The `params` block — runtime carrier for the shared params bag.
//
// It takes no inputs and publishes the (frozen) bag — scalar tunables plus the
// mission route — to `state.K` every tick, so every other block can read
// `state.K.*` through its mapStateIn. This is the only const-delivery path that
// survives block editing: the source editor strips imports before compiling, so
// consts must arrive as data, not as an `import`. Editing this block in the UI
// retunes the whole stack (and the route) at once; the values are frozen, so no
// block can mutate them.

import type { BlockConfig, ModelState } from '../../../engine/types';
import type { QuadConsts, StepDef } from './consts';

// Render a scalar back to readable source. Numbers that are really symbolic
// (π, π/2) are printed as Math.* so the editable source stays legible.
function fmt(v: number): string {
  if (v === Math.PI) return 'Math.PI';
  if (v === Math.PI / 2) return 'Math.PI / 2';
  return String(v);
}

function fmtStep(s: StepDef): string {
  const t = s.timeout !== undefined ? `, timeout: ${s.timeout}` : '';
  return `      { pos: { x: ${s.pos.x}, y: ${s.pos.y}, z: ${s.pos.z} }, threshold: ${s.threshold}${t} },`;
}

// Generate the editable source shown in the block editor. Kept in sync with the
// programmatic default by construction — both derive from the same values.
export function renderParamsSource(values: QuadConsts, route: StepDef[]): string {
  const scalarLines = (Object.keys(values) as (keyof QuadConsts)[])
    .map(k => `    ${k}: ${fmt(values[k])},`)
    .join('\n');
  const stepLines = route.map(fmtStep).join('\n');
  return `// params — single source of truth for the quad stack's tunable constants
// and the mission route. Every block reads these via state.K. Values are frozen
// at runtime: blocks can read them but never mutate them. Edit and Stage to
// retune the whole model (or reshape the route) at once.

export function params() {
  return {
${scalarLines}
    steps: [
${stepLines}
    ],
  };
}
`;
}

// Build the params BlockConfig for a model. \`defaults\` are the shared scalar
// tunables (QUAD_DEFAULTS), \`route\` is this model's waypoint list, and
// \`overrides\` patch the scalars per simulation instance.
export function makeParamsBlock(
  defaults: QuadConsts,
  route: StepDef[],
  overrides?: Partial<QuadConsts>,
): BlockConfig {
  const scalars: QuadConsts = { ...defaults, ...overrides };
  return {
    sourceId: 'params',
    exportName: 'params',
    defaultFn: () => ({ ...scalars, steps: route.map(s => ({ ...s, pos: { ...s.pos } })) }) as unknown as ModelState,
    defaultCode: renderParamsSource(scalars, route),
    mapStateIn: () => ({}),
    // Freeze here so immutability holds even for user-edited params source.
    mapStateOut: (out, s) => ({ ...s, K: Object.freeze(out) }),
    tickFrequency: 1,
  };
}
