import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { subscribe, getHistory } from '../engine/engine';
import type { SimContext } from '../useSim';
import { useResolvedSimContext } from '../useResolvedSimContext';
import { getPath, type ChartConfig } from '../engine/types';
import './sim.css';

// Pairs of solid/light colors cycling per series slot across charts
const AUTO_COLORS = [
  '#ff4444', '#ff9999',
  '#44cc44', '#aaffaa',
  '#4488ff', '#aaccff',
  '#ffaa00', '#ffdd88',
  '#aa44ff', '#ddaaff',
];

function buildChartsFromVarIds(varIds: string[][]): ChartConfig[] {
  let colorIdx = 0;
  return varIds.map(vars => ({
    label: vars.join(' / '),
    series: vars.map(v => ({
      var: v,
      label: v,
      color: AUTO_COLORS[colorIdx++ % AUTO_COLORS.length],
    })),
  }));
}

interface Props {
  ctx?: SimContext;
  simId?: string;
  modelId?: string;
  chartId?: string;
  varIds?: string[][];
}

export default function SimCharts({ ctx, simId: simIdProp, modelId: modelIdProp, chartId, varIds }: Props) {
  const { resolved, sentinelRef } = useResolvedSimContext(ctx, simIdProp, modelIdProp);

  if (!resolved) return <div ref={sentinelRef} />;

  let charts: ChartConfig[];
  if (varIds) {
    charts = buildChartsFromVarIds(varIds);
  } else if (chartId) {
    const found = resolved.config.charts.find(c => c.label === chartId);
    charts = found ? [found] : [];
  } else {
    charts = resolved.config.charts;
  }

  return (
    <div className="sim-charts">
      {charts.map(chart => (
        <SingleChart key={chart.label} simId={resolved.simId} chart={chart} />
      ))}
    </div>
  );
}

interface SingleChartProps {
  simId: string;
  chart: ChartConfig;
}

export function SingleChart({ simId, chart }: SingleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef<number[][]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = el.clientWidth || 400;

    const opts: uPlot.Options = {
      width,
      height: 140,
      title: chart.label,
      series: [
        {},
        ...chart.series.map(s => ({
          label: s.label,
          stroke: s.color,
          width: 1.5,
        })),
      ],
      axes: [{ label: 'tick' }, {}],
      cursor: { show: true },
    };

    const history = getHistory(simId);
    dataRef.current = [
      history.map((_, i) => i),
      ...chart.series.map(s => history.map(h => s.fn ? s.fn(h) : getPath(h, s.var ?? ''))),
    ];

    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, dataRef.current as uPlot.AlignedData, el);

    const ro = new ResizeObserver(([entry]) => {
      plotRef.current?.setSize({ width: entry.contentRect.width, height: 140 });
    });
    ro.observe(el);

    const unsub = subscribe(simId, (state, tick) => {
      dataRef.current[0].push(tick);
      chart.series.forEach((s, i) => {
        dataRef.current[i + 1].push(s.fn ? s.fn(state) : getPath(state, s.var ?? ''));
      });
      plotRef.current?.setData(dataRef.current as uPlot.AlignedData);
    });

    return () => {
      ro.disconnect();
      unsub();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [simId, chart]);

  return <div ref={containerRef} className="sim-chart" />;
}
