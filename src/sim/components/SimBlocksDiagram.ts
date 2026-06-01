import { MarkerType, type InternalNode, type Node, type Edge } from '@xyflow/react';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { BlockConfig, DiagramEdge, ModelConfig, ModelState } from '../engine/types';

// ── Variable analysis ─────────────────────────────────────────────────────────
// Derive which global-state paths each block reads (via Proxy on mapStateIn)
// and writes (via sentinel values through mapStateOut). Overlap between block
// A's writes and block B's reads means A feeds B.

const SENTINEL = 9_007_199;

function toSentinel(tmpl: ModelState): ModelState {
  const out: ModelState = {};
  for (const [k, v] of Object.entries(tmpl))
    out[k] = typeof v === 'object' && v !== null ? toSentinel(v as ModelState) : SENTINEL;
  return out;
}

function collectSentinel(obj: ModelState, pfx: string, acc: string[]) {
  for (const [k, v] of Object.entries(obj)) {
    const p = pfx ? `${pfx}.${k}` : k;
    if (v === SENTINEL) acc.push(p);
    else if (typeof v === 'object' && v !== null) collectSentinel(v as ModelState, p, acc);
  }
}

function getWritePaths(block: BlockConfig, state: ModelState): string[] {
  try {
    const sentinel = toSentinel(block.defaultFn(block.mapStateIn(state)));
    const paths: string[] = [];
    collectSentinel(block.mapStateOut(sentinel, state), '', paths);
    return paths;
  } catch { return []; }
}

function makeProxy(obj: ModelState, pfx: string, acc: Set<string>): ModelState {
  return new Proxy(obj as Record<string, unknown>, {
    get(t, prop) {
      if (typeof prop !== 'string') return (t as Record<string | symbol, unknown>)[prop];
      const path = pfx ? `${pfx}.${prop}` : prop;
      acc.add(path);
      const val = t[prop];
      return typeof val === 'object' && val !== null
        ? makeProxy(val as ModelState, path, acc)
        : val;
    },
  }) as ModelState;
}

function getReadPaths(block: BlockConfig, state: ModelState): string[] {
  try {
    const acc = new Set<string>();
    block.mapStateIn(makeProxy(state, '', acc));
    // Drop intermediate traversal paths — keep only the deepest-accessed path
    // at each branch (i.e. discard any path that is a strict prefix of another).
    const all = [...acc];
    return all.filter(p => !all.some(other => other !== p && other.startsWith(p + '.')));
  } catch { return []; }
}

function pathOverlap(writes: string[], reads: string[]): string[] {
  const out = new Set<string>();
  for (const w of writes)
    for (const r of reads)
      if (w === r || w.startsWith(r + '.') || r.startsWith(w + '.'))
        out.add(w.length <= r.length ? w : r);
  return [...out].sort();
}

export interface Connection { from: string; to: string; vars: string[]; label?: string }

export const connKey = (from: string, to: string) => `${from}->${to}`;

// Reproduce the engine's static slice (e.g. { K }) so dataflow analysis runs
// blocks against the same state they see at tick time. Without this, any block
// that reads `state.K.*` throws in getWritePaths (K is absent from initialState
// since the static-slice change), losing every edge that originates from it.
function computeStaticSlice(config: ModelConfig): ModelState {
  let slice: ModelState = {};
  for (const block of config.blocks) {
    if (!block.static) continue;
    try {
      const out = block.defaultFn(block.mapStateIn(slice));
      slice = block.mapStateOut(out, slice);
    } catch { /* ignore — best-effort for diagram only */ }
  }
  return slice;
}

export function analyzeConnections(config: ModelConfig): Connection[] {
  // Static keys are authoritative (match engine's `{ ...state, ...staticState }`).
  const analysisState: ModelState = { ...config.initialState, ...computeStaticSlice(config) };
  const infos = config.blocks.map(b => ({
    id:     b.sourceId,
    writes: getWritePaths(b, analysisState),
    reads:  getReadPaths(b,  analysisState),
  }));
  const out: Connection[] = [];
  for (let i = 0; i < infos.length; i++)
    for (let j = 0; j < infos.length; j++) {
      if (i === j) continue;
      const vars = pathOverlap(infos[i].writes, infos[j].reads);
      if (vars.length) out.push({ from: infos[i].id, to: infos[j].id, vars });
    }
  return out;
}

// ── Dagre layout ──────────────────────────────────────────────────────────────
// Visible edges (blocksDiagram pairs, or sequential fallback) drive layout at
// weight 2. All other real connections are included at weight 1 so Dagre still
// accounts for them, but they don't override the primary pipeline structure.

export const NODE_W = 120;
export const NODE_H = 50;

export function buildLayout(
  config: ModelConfig,
  allConns: Connection[],
): { nodes: Node[]; visibleConns: Connection[] } {
  const byKey = new Map(allConns.map(c => [connKey(c.from, c.to), c]));

  const visibleConns: Connection[] = config.blocksDiagram
    ? config.blocksDiagram
        .map((e: DiagramEdge): Connection | undefined => {
          const c = byKey.get(connKey(e.from, e.to));
          return c ? { ...c, label: e.label } : undefined;
        })
        .filter((c): c is Connection => c != null)
    : (() => {
        const order = config.blocks.map(b => b.sourceId);
        return allConns.filter(
          c => order.indexOf(c.to) === order.indexOf(c.from) + 1
        );
      })();

  const visibleSet = new Set(visibleConns.map(c => connKey(c.from, c.to)));

  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });
  config.blocks.forEach(b => g.setNode(b.sourceId, { width: NODE_W, height: NODE_H }));
  allConns.forEach(c =>
    g.setEdge(c.from, c.to, { weight: visibleSet.has(connKey(c.from, c.to)) ? 2 : 1 })
  );
  dagreLayout(g);

  const nodes: Node[] = config.blocks.map(b => {
    const { x, y } = g.node(b.sourceId);
    return {
      id:       b.sourceId,
      type:     'block',
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data:     { label: b.sourceId, freq: b.tickFrequency },
    };
  });

  return { nodes, visibleConns };
}

// ── React Flow edge helpers ───────────────────────────────────────────────────

export interface Waypoint { x: number; y: number }
export interface EdgeData  { vars: string[]; waypoint?: Waypoint; label?: string }
export type SetWaypoint = (id: string, wp: Waypoint | null) => void;

export const EDGE_STYLE        = { stroke: '#3a5870', strokeWidth: 1.5 };
export const EDGE_STYLE_HOVER  = { stroke: '#4488ff', strokeWidth: 2   };
export const EDGE_MARKER       = { type: MarkerType.ArrowClosed, color: '#3a5870'  };
export const EDGE_MARKER_HOVER = { type: MarkerType.ArrowClosed, color: '#4488ff'  };

export function buildEdges(
  visibleConns: Connection[],
  allConns:     Connection[],
  selectedId:   string | null,
  hoveredId:    string | null,
  waypoints:    Record<string, Waypoint>,
): Edge[] {
  const visSet = new Set(visibleConns.map(c => connKey(c.from, c.to)));
  const shown  = selectedId
    ? [
        ...visibleConns,
        ...allConns.filter(c =>
          (c.from === selectedId || c.to === selectedId) &&
          !visSet.has(connKey(c.from, c.to))
        ),
      ]
    : visibleConns;

  return shown.map(c => {
    const id      = connKey(c.from, c.to);
    const hovered = id === hoveredId;
    return {
      id,
      source:    c.from,
      target:    c.to,
      type:      'floating',
      data:      { vars: c.vars, waypoint: waypoints[id], label: c.label },
      style:     hovered ? EDGE_STYLE_HOVER : EDGE_STYLE,
      markerEnd: hovered ? EDGE_MARKER_HOVER : EDGE_MARKER,
    };
  });
}

// Floating edge helpers — compute connection points from live node positions.

export function nodeCenter(n: InternalNode) {
  return {
    x: n.internals.positionAbsolute.x + (n.measured?.width  ?? NODE_W) / 2,
    y: n.internals.positionAbsolute.y + (n.measured?.height ?? NODE_H) / 2,
  };
}

export function borderPoint(n: InternalNode, toward: { x: number; y: number }) {
  const hw = (n.measured?.width  ?? NODE_W) / 2;
  const hh = (n.measured?.height ?? NODE_H) / 2;
  const c  = nodeCenter(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const s = Math.min(
    dx ? Math.abs(hw / dx) : Infinity,
    dy ? Math.abs(hh / dy) : Infinity,
  );
  return { x: c.x + dx * s, y: c.y + dy * s };
}
