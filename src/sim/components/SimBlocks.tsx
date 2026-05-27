import {
  useState, useMemo, useCallback,
  createContext, useContext,
} from 'react';
import {
  ReactFlow, Background, BackgroundVariant,
  BaseEdge, EdgeLabelRenderer, Handle, Position,
  useNodesState, useReactFlow, useInternalNode,
  type Node, type Edge, type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SimContext } from '../useSim';
import { useResolvedSimContext } from '../useResolvedSimContext';
import {
  analyzeConnections, buildLayout, buildEdges, nodeCenter, borderPoint,
  type Waypoint, type EdgeData, type SetWaypoint,
} from './SimBlocksDiagram';
import './sim.css';

interface Props {
  ctx?: SimContext;
  simId?: string;
  modelId?: string;
}

// ── Step 3: React Flow rendering ──────────────────────────────────────────────

const WaypointCtx = createContext<SetWaypoint>(() => {});

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
  const { resolved, sentinelRef } = useResolvedSimContext(ctx, simIdProp, modelIdProp);

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
