import { Group, Panel, Separator } from 'react-resizable-panels';
import { useState, useEffect, useCallback, useRef } from 'react';
import CollapsibleSidePanel from './CollapsibleSidePanel';
import TableOfContents from './TableOfContents';
import SourceTab from './SourceTab';
import VisualisationTab from './VisualisationTab';
import SimCharts from '../sim/components/SimCharts';
import SimStatePanel from '../sim/components/SimStatePanel';
import { resolveSimContext } from '../sim/useSim';
import './styles.css';

export interface PageShellProps {
  pageIds: string[];
  pageSimIds: Record<string, string>;
  pageModelIds: Record<string, string>;
  pageTocNames: Record<string, string>;
}

type View = 'chapter' | 'src' | 'vis';

function parseHash(hash: string): { pageId: string; view: View } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');
  const pageId = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
  const viewParam = new URLSearchParams(qs).get('view');
  const view: View = viewParam === 'src' || viewParam === 'vis' ? viewParam : 'chapter';
  return { pageId: pageId || 'index', view };
}

function ChapterContent({ pageId }: { pageId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prevElRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const store = document.getElementById('page-store');

    if (prevElRef.current && store) {
      store.appendChild(prevElRef.current);
    }

    const el = store?.querySelector(`[data-page-id="${pageId}"]`) ?? null;
    ref.current.innerHTML = '';

    if (el) {
      ref.current.appendChild(el);
      prevElRef.current = el;
    } else {
      ref.current.innerHTML = `<p class="page-not-found">Page not found: ${pageId}</p>`;
      prevElRef.current = null;
    }

    return () => {
      if (prevElRef.current && store) {
        store.appendChild(prevElRef.current);
        prevElRef.current = null;
      }
    };
  }, [pageId]);

  return <div ref={ref} className="chapter-content" />;
}

function ChartsPanel({ simId, modelId }: { simId?: string; modelId?: string }) {
  const ctx = simId ? resolveSimContext(simId, modelId) : null;
  if (!ctx) return <div className="panel-placeholder">No charts for this page.</div>;
  return <SimCharts ctx={ctx} />;
}

const TABS: { id: View; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'src', label: 'Source' },
  { id: 'vis', label: 'Visualisation' },
];

export default function PageShell({ pageIds, pageSimIds, pageModelIds, pageTocNames }: PageShellProps) {
  const [{ pageId, view }, setRoute] = useState(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((id: string) => {
    window.location.hash = `#${id}`;
  }, []);

  const switchView = useCallback(
    (newView: View) => {
      const suffix = newView === 'chapter' ? '' : `?view=${newView}`;
      window.location.hash = `#${pageId}${suffix}`;
    },
    [pageId],
  );

  const simId = pageSimIds[pageId];
  const modelId = pageModelIds[pageId];

  return (
    <div className="app-root">
      <Group orientation="horizontal" className="app-h-group">

        {/* Left panel — Table of Contents */}
        <CollapsibleSidePanel
          position="left"
          title="Table of Contents"
          ContentComponent={() => (
            <TableOfContents pageIds={pageIds} currentPage={pageId} onNavigate={navigate} tocNames={pageTocNames} />
          )}
          defaultSize="20%"
          minSize="10%"
        />

        <Separator className="app-h-separator" />

        {/* Main panel */}
        <Panel className="app-main-panel">

          {/* Tab bar */}
          <div className="tab-bar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchView(tab.id)}
                className={`tab-button${view === tab.id ? ' tab-button--active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content + bottom charts panel */}
          <Group orientation="vertical" className="app-v-group">

            <Panel className="content-panel">
              {view === 'chapter' && <ChapterContent pageId={pageId} />}
              {view === 'src' && <SourceTab pageName={pageId} simId={simId} modelId={modelId} />}
              {view === 'vis' && <VisualisationTab pageName={pageId} simId={simId} modelId={modelId} />}
            </Panel>

            {view === 'vis' && (
              <>
                <Separator className="app-v-separator" />
                <CollapsibleSidePanel
                  position="bottom"
                  title="Charts"
                  ContentComponent={() => <ChartsPanel simId={simId} modelId={modelId} />}
                  defaultSize="35%"
                  minSize="10%"
                />
              </>
            )}

          </Group>
        </Panel>

        <Separator className="app-h-separator" />

        {/* Right panel — simulation state */}
        <CollapsibleSidePanel
          position="right"
          title="State"
          ContentComponent={() => {
            const ctx = simId ? resolveSimContext(simId, modelId) : null;
            if (!ctx) return <div className="panel-placeholder">No simulation for this page.</div>;
            return <SimStatePanel ctx={ctx} />;
          }}
          defaultSize="20%"
          minSize="10%"
          defaultCollapsed
        />

      </Group>
    </div>
  );
}
