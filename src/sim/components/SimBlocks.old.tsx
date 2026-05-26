import { useState, useLayoutEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useReactFlow,
  useInternalNode,
  type Node,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import { resolveSimContext } from '../useSim';
import type { SimContext } from '../useSim';
import type { BlockConfig, ModelConfig, ModelState } from '../engine/types';
import './sim.css';

interface Props {
  ctx?: SimContext;
  simId?: string;
  modelId?: string;
}

// ── path tracing ──────────────────────────────────────────────────────

const SENTINEL = 9_007_199;

function makeSentinel(tmpl: ModelState): ModelState {
  const out: ModelState = {};
  for (const [k, v] of Object.entries(tmpl)) {
    out[k] = (typeof v === 'object' && v !== null) ? makeSentinel(v as ModelState) : SENTINEL;
  }
  return out;
}

function collectSentinelPaths(obj: ModelState, prefix: string, acc: string[]) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v === SENTINEL) acc.push(p);
    else if (typeof v === 'object' && v !== null) collectSentinelPaths(v as ModelState, p, acc);
  }
}

function getWritePaths(block: BlockConfig, state: ModelState): string[] {
  try {
    const blockInput = block.mapStateIn(state);
    const blockOutput = block.defaultFn(blockInput);
    const sentinel = makeSentinel(blockOutput);
    const result = block.mapStateOut(sentinel, state);
    const paths: string[] = [];
    collectSentinelPaths(result, '', paths);
    return paths;
  } catch {
    return [];
  }
}

function makeReadProxy(obj: ModelState, prefix: string, acc: Set<string>): ModelState {
  return new Proxy(obj as any, {
    get(target, prop) {
      if (typeof prop !== 'string') return (target as any)[prop];
      const path = prefix ? `${prefix}.${prop}` : prop;
      const val = (target as any)[prop];
      acc.add(path);
      if (typeof val === 'object' && val !== null) return makeReadProxy(val as ModelState, path, acc);
      return val;
    },
  });
}

function getReadPaths(block: BlockConfig, state: ModelState): string[] {
  try {
    const acc = new Set<string>();
    block.mapStateIn(makeReadProxy(state, '', acc));
    return [...acc];
  } catch {
    return [];
  }
}

function findOverlap(writePaths: string[], readPaths: string[]): string[] {
  const result = new Set<string>();
  for (const w of writePaths) {
    for (const r of readPaths) {
      if (w === r || w.startsWith(r + '.') || r.startsWith(w + '.')) {
        result.add(w.length <= r.length ? w : r);
      }
    }
  }
  return [...result].sort();
}

// ── connection model ──────────────────────────────────────────────────

interface Connection {
  from: string;
  to: string;
  vars: string[];
}

interface Waypoint { x: number; y: number }

interface EdgeData extends Record<string, unknown> {
  vars: string[];
  waypoint?: Waypoint;
}

const connId = (c: Connection) => `${c.from}->${c.to}`;

function buildAllConnections(config: ModelConfig): Connection[] {
  const infos = config.blocks.map(block => ({
    id: block.sourceId,
    writePaths: getWritePaths(block, config.initialState),
    readPaths: getReadPaths(block, config.initialState),
  }));
  const conns: Connection[] = [];
  for (let i = 0; i < infos.length; i++) {
    for (let j = 0; j < infos.length; j++) {
      if (i === j) continue;
      const vars = findOverlap(infos[i].writePaths, infos[j].readPaths);
      if (vars.length > 0) conns.push({ from: infos[i].id, to: infos[j].id, vars });
    }
  }
  return conns;
}

// ── graph layout + static classification ──────────────────────────────

const NODE_W = 120;
const NODE_H = 50;

function buildLayoutAndStaticConns(
  config: ModelConfig,
  allConns: Connection[],
): { nodes: Node[]; staticConns: Connection[] } {
  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 });

  const blockIds = config.blocks.map(b => b.sourceId);
  blockIds.forEach(id => g.setNode(id, { width: NODE_W, height: NODE_H }));
  allConns.forEach(c => g.setEdge(c.from, c.to));
  dagreLayout(g);

  const nodes: Node[] = config.blocks.map(block => {
    const { x, y } = g.node(block.sourceId);
    return {
      id: block.sourceId,
      type: 'block',
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data: { label: block.sourceId, freq: block.tickFrequency },
    };
  });

  // Derive rank from x positions: same column = same rounded x = same rank
  const sortedUniqueXs = [...new Set(blockIds.map(id => Math.round(g.node(id).x)))].sort((a, b) => a - b);
  const xToRank = new Map(sortedUniqueXs.map((x, i) => [x, i]));
  const rankOf = (id: string) => xToRank.get(Math.round(g.node(id).x)) ?? -1;

  const orderOf = new Map(blockIds.map((id, i) => [id, i]));

  // Rule 1: adjacent dagre rank  |rank(from) - rank(to)| === 1
  // Rule 3: adjacent execution order  order(to) === order(from) + 1
  const staticConns = allConns.filter(c => {
    const rule1 = Math.abs(rankOf(c.from) - rankOf(c.to)) === 1;
    const rule3 = (orderOf.get(c.to) ?? -1) === (orderOf.get(c.from) ?? -2) + 1;
    return rule1 || rule3;
  });

  return { nodes, staticConns };
}

// ── edge building ─────────────────────────────────────────────────────

const EDGE_STYLE        = { stroke: '#3a5870', strokeWidth: 1.5 };
const EDGE_STYLE_HOVER  = { stroke: '#4488ff', strokeWidth: 2 };
const EDGE_MARKER       = { type: MarkerType.ArrowClosed, color: '#3a5870' };
const EDGE_MARKER_HOVER = { type: MarkerType.ArrowClosed, color: '#4488ff' };

function buildEdges(
  staticConns: Connection[],
  allConns: Connection[],
  selectedNodeId: string | null,
  hoveredEdgeId: string | null,
  waypoints: Record<string, Waypoint>,
): Edge<EdgeData>[] {
  const staticIds = new Set(staticConns.map(connId));

  const visible = selectedNodeId
    ? [
        ...staticConns,
        ...allConns.filter(c =>
          (c.from === selectedNodeId || c.to === selectedNodeId) && !staticIds.has(connId(c))
        ),
      ]
    : staticConns;

  return visible.map(c => {
    const id = connId(c);
    const hovered = id === hoveredEdgeId;
    return {
      id,
      source: c.from,
      target: c.to,
      type: 'floating',
      data: { vars: c.vars, waypoint: waypoints[id] },
      style: hovered ? EDGE_STYLE_HOVER : EDGE_STYLE,
      markerEnd: hovered ? EDGE_MARKER_HOVER : EDGE_MARKER,
    };
  });
}

// ── custom edge ───────────────────────────────────────────────────────

type SetWaypoint = (id: string, wp: Waypoint | null) => void;
const WaypointCtx = createContext<SetWaypoint>(() => {});

function nodeCenter(n: InternalNode): { x: number; y: number } {
  return {
    x: n.internals.positionAbsolute.x + (n.measured?.width  ?? NODE_W) / 2,
    y: n.internals.positionAbsolute.y + (n.measured?.height ?? NODE_H) / 2,
  };
}

// Intersection of the center→toward ray with the node's border rectangle.
function borderPoint(n: InternalNode, toward: { x: number; y: number }): { x: number; y: number } {
  const hw = (n.measured?.width  ?? NODE_W) / 2;
  const hh = (n.measured?.height ?? NODE_H) / 2;
  const c  = nodeCenter(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scale = Math.min(
    dx !== 0 ? Math.abs(hw / dx) : Infinity,
    dy !== 0 ? Math.abs(hh / dy) : Infinity,
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

function FloatingEdge({ id, source, target, data, style, markerEnd }: EdgeProps<Edge<EdgeData>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const setWaypoint = useContext(WaypointCtx);
  const { screenToFlowPosition } = useReactFlow();

  if (!sourceNode || !targetNode) return null;

  const srcCenter = nodeCenter(sourceNode);
  const dstCenter = nodeCenter(targetNode);
  const sx = borderPoint(sourceNode, dstCenter).x;
  const sy = borderPoint(sourceNode, dstCenter).y;
  const tx = borderPoint(targetNode, srcCenter).x;
  const ty = borderPoint(targetNode, srcCenter).y;

  const wp = data?.waypoint;
  const handleX = wp?.x ?? (sx + tx) / 2;
  const handleY = wp?.y ?? (sy + ty) / 2;

  // Quadratic bezier control point: curve passes through handle at t=0.5
  const cx = 2 * handleX - (sx + tx) / 2;
  const cy = 2 * handleY - (sy + ty) / 2;
  const path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (me: PointerEvent) => {
      setWaypoint(id, screenToFlowPosition({ x: me.clientX, y: me.clientY }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [id, setWaypoint, screenToFlowPosition]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWaypoint(id, null);
  }, [id, setWaypoint]);

  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} interactionWidth={12} />
      <EdgeLabelRenderer>
        <div
          className="sim-blocks__edge-handle nodrag nopan"
          style={{ transform: `translate(-50%,-50%) translate(${handleX}px,${handleY}px)` }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      </EdgeLabelRenderer>
    </>
  );
}

// ── custom node ───────────────────────────────────────────────────────

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

// ── outer (context resolution) ────────────────────────────────────────

export default function SimBlocks({ ctx, simId: simIdProp, modelId: modelIdProp }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState<SimContext | null>(ctx ?? null);

  useLayoutEffect(() => {
    if (ctx) { setResolved(ctx); return; }
    const ancestor = sentinelRef.current?.closest('[data-sim-id]');
    const domSimId = ancestor?.getAttribute('data-sim-id') ?? undefined;
    const domModelId = ancestor?.getAttribute('data-model-id') ?? undefined;
    const effectiveSimId = simIdProp ?? domSimId;
    if (effectiveSimId) {
      const r = resolveSimContext(effectiveSimId, modelIdProp ?? domModelId);
      if (r) setResolved(r);
    }
  }, [ctx, simIdProp, modelIdProp]);

  if (!resolved) return <div ref={sentinelRef} />;
  return <SimBlocksInner key={resolved.config.modelId} ctx={resolved} />;
}

// ── inner ─────────────────────────────────────────────────────────────

interface Tooltip {
  source: string;
  target: string;
  vars: string[];
  x: number;
  y: number;
}

function SimBlocksInner({ ctx }: { ctx: SimContext }) {
  const { config } = ctx;

  // Stage 1 — analyze connections + layout
  const allConns = useMemo(() => buildAllConnections(config), [config]);
  const { nodes: layoutedNodes, staticConns } = useMemo(
    () => buildLayoutAndStaticConns(config, allConns),
    [config, allConns],
  );

  // Stage 3 — render state
  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredEdgeId,  setHoveredEdgeId]  = useState<string | null>(null);
  const [waypoints,      setWaypointMap]     = useState<Record<string, Waypoint>>({});
  const [tooltip,        setTooltip]         = useState<Tooltip | null>(null);

  const setWaypoint = useCallback<SetWaypoint>((id, wp) => {
    setWaypointMap(prev => {
      if (wp === null) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: wp };
    });
  }, []);

  const edges = useMemo(
    () => buildEdges(staticConns, allConns, selectedNodeId, hoveredEdgeId, waypoints),
    [staticConns, allConns, selectedNodeId, hoveredEdgeId, waypoints],
  );

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeId(sel[0]?.id ?? null);
    },
    [],
  );

  const onEdgeMouseEnter = useCallback((e: React.MouseEvent, edge: Edge) => {
    setHoveredEdgeId(edge.id);
    setTooltip({
      source: edge.source,
      target: edge.target,
      vars: (edge.data as EdgeData)?.vars ?? [],
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const onEdgeMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  }, []);

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
          <div className="sim-blocks__tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
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
