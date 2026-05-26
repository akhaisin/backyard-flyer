import {
  useState, useLayoutEffect, useMemo, useCallback,
  useRef, createContext, useContext,
} from 'react';
import {
  ReactFlow, Background, BackgroundVariant,
  BaseEdge, EdgeLabelRenderer, Handle, Position, MarkerType,
  useNodesState, useReactFlow, useInternalNode,
  type Node, type Edge, type EdgeProps, type InternalNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { resolveSimContext } from '../useSim';
import type { SimContext } from '../useSim';
import type { BlockConfig, DiagramEdge, ModelConfig, ModelState } from '../engine/types';
import './sim.css';

interface Props {
  ctx?: SimContext;
  simId?: string;
  modelId?: string;
}

// ── Step 1: Variable analysis ─────────────────────────────────────────────────
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
    return [...acc];
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

interface Connection { from: string; to: string; vars: string[]; label?: string }

const connKey = (from: string, to: string) => `${from}->${to}`;

function analyzeConnections(config: ModelConfig): Connection[] {
  const infos = config.blocks.map(b => ({
    id:     b.sourceId,
    writes: getWritePaths(b, config.initialState),
    reads:  getReadPaths(b,  config.initialState),
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

// ── Step 2: Dagre layout ──────────────────────────────────────────────────────
// Visible edges (blocksDiagram pairs, or sequential fallback) drive layout at
// weight 2. All other real connections are included at weight 1 so Dagre still
// accounts for them, but they don't override the primary pipeline structure.

const NODE_W = 120;
const NODE_H = 50;

function buildLayout(
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

// ── Step 3: React Flow rendering ──────────────────────────────────────────────

interface Waypoint { x: number; y: number }
interface EdgeData  { vars: string[]; waypoint?: Waypoint; label?: string }

type SetWaypoint = (id: string, wp: Waypoint | null) => void;
const WaypointCtx = createContext<SetWaypoint>(() => {});

const EDGE_STYLE        = { stroke: '#3a5870', strokeWidth: 1.5 };
const EDGE_STYLE_HOVER  = { stroke: '#4488ff', strokeWidth: 2   };
const EDGE_MARKER       = { type: MarkerType.ArrowClosed, color: '#3a5870'  };
const EDGE_MARKER_HOVER = { type: MarkerType.ArrowClosed, color: '#4488ff'  };

function buildEdges(
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

function nodeCenter(n: InternalNode) {
  return {
    x: n.internals.positionAbsolute.x + (n.measured?.width  ?? NODE_W) / 2,
    y: n.internals.positionAbsolute.y + (n.measured?.height ?? NODE_H) / 2,
  };
}

function borderPoint(n: InternalNode, toward: { x: number; y: number }) {
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

// Custom edge: ignores React Flow's handle-based source/target coordinates and
// instead queries live node positions to place endpoints at the nearest border.
function FloatingEdge({ id, source, target, data, style, markerEnd }: EdgeProps) {
  const ed      = data as EdgeData | undefined;
  const srcNode = useInternalNode(source);
  const dstNode = useInternalNode(target);
  const setWp   = useContext(WaypointCtx);
  const { screenToFlowPosition } = useReactFlow();

  if (!srcNode || !dstNode) return null;

  const sc = nodeCenter(srcNode);
  const tc = nodeCenter(dstNode);
  const sp = borderPoint(srcNode, tc);
  const tp = borderPoint(dstNode, sc);

  const hx = ed?.waypoint?.x ?? (sp.x + tp.x) / 2;
  const hy = ed?.waypoint?.y ?? (sp.y + tp.y) / 2;

  // Control point so the bezier passes through (hx,hy) at t=0.5
  const cpx = 2 * hx - (sp.x + tp.x) / 2;
  const cpy = 2 * hy - (sp.y + tp.y) / 2;
  const path = `M ${sp.x} ${sp.y} Q ${cpx} ${cpy} ${tp.x} ${tp.y}`;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const move = (me: PointerEvent) =>
      setWp(id, screenToFlowPosition({ x: me.clientX, y: me.clientY }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [id, setWp, screenToFlowPosition]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWp(id, null);
  }, [id, setWp]);

  return (
    <>
      <BaseEdge
        path={path}
        style={style as React.CSSProperties}
        markerEnd={markerEnd}
        interactionWidth={12}
      />
      <EdgeLabelRenderer>
        <div
          className="sim-blocks__edge-handle nodrag nopan"
          style={{ transform: `translate(-50%,-50%) translate(${hx}px,${hy}px)` }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
        {ed?.label && (
          <div
            className="sim-blocks__edge-label nodrag nopan"
            style={{ transform: `translate(-50%,-100%) translate(${hx}px,${hy - 6}px)` }}
          >
            {ed.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

// Hidden handles are kept so React Flow wires up edges; FloatingEdge ignores
// their positions and computes its own from nodeCenter/borderPoint above.
function BlockNode({ data }: { data: { label: string; freq: number } }) {
  return (
    <div className="sim-blocks__node">
      <Handle type="target" position={Position.Left}  style={{ opacity: 0 }} />
      <div className="sim-blocks__node-name">{data.label}</div>
      {data.freq > 1 && <div className="sim-blocks__node-freq">÷{data.freq}</div>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { block: BlockNode };
const edgeTypes = { floating: FloatingEdge };

// ── Outer: context resolution ─────────────────────────────────────────────────

export default function SimBlocks({ ctx, simId: simIdProp, modelId: modelIdProp }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<SimContext | null>(ctx ?? null);

  useLayoutEffect(() => {
    if (ctx) { setResolved(ctx); return; }
    const ancestor   = sentinelRef.current?.closest('[data-sim-id]');
    const domSimId   = ancestor?.getAttribute('data-sim-id')   ?? undefined;
    const domModelId = ancestor?.getAttribute('data-model-id') ?? undefined;
    const sid        = simIdProp ?? domSimId;
    if (sid) {
      const r = resolveSimContext(sid, modelIdProp ?? domModelId);
      if (r) setResolved(r);
    }
  }, [ctx, simIdProp, modelIdProp]);

  if (!resolved) return <div ref={sentinelRef} />;
  return <SimBlocksInner key={resolved.config.modelId} ctx={resolved} />;
}

// ── Inner ─────────────────────────────────────────────────────────────────────

interface Tooltip { source: string; target: string; vars: string[]; x: number; y: number }

function SimBlocksInner({ ctx }: { ctx: SimContext }) {
  const { config } = ctx;

  // Step 1
  const allConns = useMemo(() => analyzeConnections(config), [config]);

  // Step 2
  const { nodes: initialNodes, visibleConns } = useMemo(
    () => buildLayout(config, allConns),
    [config, allConns],
  );

  // Step 3
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [waypoints,     setWaypointMap]   = useState<Record<string, Waypoint>>({});
  const [tooltip,       setTooltip]       = useState<Tooltip | null>(null);

  const setWaypoint = useCallback<SetWaypoint>((id, wp) => {
    setWaypointMap(prev => {
      if (wp === null) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: wp };
    });
  }, []);

  const edges = useMemo(
    () => buildEdges(visibleConns, allConns, selectedId, hoveredEdgeId, waypoints),
    [visibleConns, allConns, selectedId, hoveredEdgeId, waypoints],
  );

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) =>
      setSelectedId(sel[0]?.id ?? null),
    [],
  );

  const onEdgeMouseEnter = useCallback((e: React.MouseEvent, edge: Edge) => {
    setHoveredEdgeId(edge.id);
    setTooltip({
      source: edge.source,
      target: edge.target,
      vars:   (edge.data as unknown as EdgeData)?.vars ?? [],
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const onEdgeMouseMove  = useCallback((e: React.MouseEvent) =>
    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null), []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null);
    setTooltip(null);
  }, []);

  return (
    <WaypointCtx.Provider value={setWaypoint}>
      <div className="sim-blocks">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={() => {}}
          onSelectionChange={onSelectionChange}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseMove={onEdgeMouseMove}
          onEdgeMouseLeave={onEdgeMouseLeave}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesConnectable={false}
          edgesReconnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2e3e" />
        </ReactFlow>

        {tooltip && (
          <div
            className="sim-blocks__tooltip"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <div className="sim-blocks__tooltip-header">
              {tooltip.source} → {tooltip.target}
            </div>
            {tooltip.vars.map(v => (
              <div key={v} className="sim-blocks__tooltip-var">{v}</div>
            ))}
          </div>
        )}
      </div>
    </WaypointCtx.Provider>
  );
}
