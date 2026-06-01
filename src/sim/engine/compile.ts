import { stripTypes } from './stripTypes';
import type { BlockFn } from './types';

// Compile editable block/lifecycle source into one or more named export fns.
// Imports are stripped first (see stripTypes) — edited code can never rely on an
// `import`, so everything it needs must be inline or arrive via its argument.
// Used by the engine (single export per block) and by the quad lib's lifecycle
// block (four exports: beforeSim/before/after/afterSim).
export function compileSource(
  code: string,
  names: string[],
): { fns: Record<string, BlockFn | undefined>; error: string | null } {
  const js = stripTypes(code);
  try {
    const mod: Record<string, unknown> = {};
    const assigns = names
      .map(n => `exports['${n}'] = typeof ${n} !== 'undefined' ? ${n} : undefined;`)
      .join('\n');
    new Function('exports', `${js}\n${assigns}`)(mod);
    const fns: Record<string, BlockFn | undefined> = {};
    for (const n of names) {
      fns[n] = typeof mod[n] === 'function' ? (mod[n] as BlockFn) : undefined;
    }
    return { fns, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sim] Compile error:', e);
    return { fns: {}, error: msg };
  }
}
