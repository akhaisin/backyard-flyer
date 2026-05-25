import { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { resolveSimContext } from '../useSim';
import type { SimContext } from '../useSim';
import type { BlockConfig, ModelState } from '../engine/types';
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
    // Run the block function to discover its output shape, then sentinel-trace mapStateOut
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

// ── types ─────────────────────────────────────────────────────────────

interface Connection {
  from: number;
  to: number;
  vars: string[];
}

interface Rect { x: number; y: number; w: number; h: number }

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
  return <SimBlocksInner ctx={resolved} />;
}

// ── inner ─────────────────────────────────────────────────────────────

function SimBlocksInner({ ctx }: { ctx: SimContext }) {
  const { config } = ctx;

  const connections = useMemo<Connection[]>(() => {
    const infos = config.blocks.map(block => ({
      writePaths: getWritePaths(block, config.initialState),
      readPaths: getReadPaths(block, config.initialState),
    }));
    const conns: Connection[] = [];
    for (let i = 0; i < infos.length; i++) {
      for (let j = 0; j < infos.length; j++) {
        if (i === j) continue;
        const vars = findOverlap(infos[i].writePaths, infos[j].readPaths);
        if (vars.length > 0) conns.push({ from: i, to: j, vars });
      }
    }
    return conns;
  }, [config]);

  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [hoveredConn, setHoveredConn] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const cr = containerRef.current.getBoundingClientRect();
      const next = blockRefs.current.map(el => {
        if (!el) return { x: 0, y: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
      });
      setRects(next);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [config.blocks.length]);

  const ready = rects.length === config.blocks.length && rects.some(r => r.w > 0);

  return (
    <div className="sim-blocks" ref={containerRef}>
      {/* SVG overlay for connections */}
      <svg
        className="sim-blocks__svg"
        aria-hidden="true"
      >
        <defs>
          <marker id="sim-blocks-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 0 L 7 4 L 0 8 Z" fill="#3a5870" />
          </marker>
          <marker id="sim-blocks-arrow-hover" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 0 L 7 4 L 0 8 Z" fill="#4488ff" />
          </marker>
        </defs>
        {ready && connections.map((conn, ci) => {
          const fr = rects[conn.from];
          const tr = rects[conn.to];
          if (!fr || !tr) return null;

          const isForward = conn.from < conn.to;
          const span = Math.abs(conn.to - conn.from);
          const arcDepth = 22 + span * 16;

          const x1 = fr.x + fr.w / 2;
          const x2 = tr.x + tr.w / 2;
          let y1: number, y2: number, cy: number;

          if (isForward) {
            y1 = fr.y + fr.h;
            y2 = tr.y + tr.h;
            cy = Math.max(y1, y2) + arcDepth;
          } else {
            y1 = fr.y;
            y2 = tr.y;
            cy = Math.min(y1, y2) - arcDepth;
          }

          const d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
          const isHovered = hoveredConn === ci;
          const stroke = isHovered ? '#4488ff' : '#3a5870';

          return (
            <g key={ci}>
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={isHovered ? 2 : 1.5}
                strokeDasharray={isForward ? undefined : '5 3'}
                markerEnd={`url(#sim-blocks-arrow${isHovered ? '-hover' : ''})`}
              />
              {/* Wide transparent hit area */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="sim-blocks__conn-hit"
                onMouseEnter={e => { setHoveredConn(ci); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => setHoveredConn(null)}
                onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
              />
            </g>
          );
        })}
      </svg>

      {/* Block row */}
      <div className="sim-blocks__row">
        {config.blocks.map((block, i) => (
          <div
            key={block.sourceId}
            className="sim-blocks__block"
            ref={el => { blockRefs.current[i] = el; }}
          >
            <div className="sim-blocks__block-name">{block.sourceId}</div>
            {block.tickFrequency > 1 && (
              <div className="sim-blocks__block-freq">÷{block.tickFrequency}</div>
            )}
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoveredConn !== null && (
        <div
          className="sim-blocks__tooltip"
          style={{ left: tooltipPos.x + 14, top: tooltipPos.y + 14 }}
        >
          <div className="sim-blocks__tooltip-header">
            {config.blocks[connections[hoveredConn].from].sourceId}
            {' → '}
            {config.blocks[connections[hoveredConn].to].sourceId}
          </div>
          {connections[hoveredConn].vars.map(v => (
            <div key={v} className="sim-blocks__tooltip-var">{v}</div>
          ))}
        </div>
      )}
    </div>
  );
}
