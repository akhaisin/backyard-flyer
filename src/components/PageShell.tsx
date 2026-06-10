import { Group, Panel, Separator } from 'react-resizable-panels';
import { useState, useEffect, useCallback, useRef } from 'react';
import { MeflyNavReceiver } from './MeflyNavReceiver';
import CollapsibleSidePanel from './CollapsibleSidePanel';
import TableOfContents from './TableOfContents';
import SourceTab from './SourceTab';
import BlocksTab from './BlocksTab';
import VisualizationTab from './VisualizationTab';
import SimChartsComponent from '../sim/components/SimChartsComponent';
import SimStatePanel from '../sim/components/SimStatePanel';
import { resolveSimContext } from '../sim/useSim';
import { pauseSim, trackSim } from '../sim/engine/engine';
import { subscribeCatalogModel, type CatalogSelection } from '../sim/catalogStore';
import { startTour } from './tour';
import useLocalStorage from '../hooks/useLocalStorage';
import './styles.css';

const TRUSTED_ORIGINS = ['https://mefly.dev', 'https://www.mefly.dev'];
const GITHUB_REPO = 'https://github.com/akhaisin/backyard-flyer';

// Accept messages from production hosts plus localhost (dev). Without the
// localhost branch, hash sync from mefly.dev → backyard-flyer is silently
// dropped during local development.
function isTrustedHost(origin: string): boolean {
  return TRUSTED_ORIGINS.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
}

export interface PageShellProps {
  pageIds: string[];
  pageSimIds: Record<string, string>;
  pageModelIds: Record<string, string>;
  pageTocNames: Record<string, string>;
}

type View = 'chapter' | 'src' | 'blocks' | 'vis';

function rewriteHashLink(anchor: Element, base: string) {
  const href = anchor.getAttribute('href');
  if (href?.startsWith('#')) anchor.setAttribute('href', base + href);
}

function rewriteAllHashLinks(base: string) {
  document.querySelectorAll('a[href^="#"]').forEach(a => rewriteHashLink(a, base));
}

function parseHash(hash: string): { pageId: string; view: View } {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');
  const pageId = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
  const viewParam = new URLSearchParams(qs).get('view');
  const view: View = viewParam === 'src' || viewParam === 'vis' || viewParam === 'blocks' ? viewParam : 'chapter';
  return { pageId, view };
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
  return <SimChartsComponent ctx={ctx} />;
}

const TABS: { id: View; label: string }[] = [
  { id: 'chapter', label: 'Chapter' },
  { id: 'src', label: 'Source' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'vis', label: 'Visualization' },
];

const HELP_SEEN_KEY = 'backyard-flyer.v1.helpSeen';

export default function PageShell({ pageIds, pageSimIds, pageModelIds, pageTocNames }: PageShellProps) {
  const isEmbedded = window.parent !== window;
  const [{ pageId, view }, setRoute] = useState(() => {
    const { pageId: id, view } = parseHash(window.location.hash);
    return { pageId: id || pageIds[0] || '', view };
  });
  const [helpSeen, setHelpSeen] = useLocalStorage(HELP_SEEN_KEY, false);
  const [catalogSel, setCatalogSel] = useState<CatalogSelection | null>(null);
  const prevRouteRef = useRef<{ pageId: string; simId?: string } | null>(null);
  const canonicalBaseRef = useRef<string>('');

  useEffect(() => subscribeCatalogModel(setCatalogSel), []);

  useEffect(() => {
    function onHashChange() {
      const { pageId: id, view } = parseHash(window.location.hash);
      setRoute({ pageId: id || pageIds[0] || '', view });
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Receive NAVIGATE_TO_HASH from host
  useEffect(() => {
    if (!isEmbedded) return;
    function onMessage(e: MessageEvent) {
      if (!isTrustedHost(e.origin)) return;
      if (e.data?.type !== 'NAVIGATE_TO_HASH') return;
      const hash: string = e.data.hash ?? '';
      if (!hash) return;
      const next = hash.startsWith('#') ? hash : `#${hash}`;
      if (window.location.hash !== next) window.location.hash = next;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isEmbedded]);

  // Notify host when hash changes
  useEffect(() => {
    if (!isEmbedded) return;
    window.parent.postMessage({ type: 'HASH_CHANGED', hash: window.location.hash }, '*');
  }, [isEmbedded, pageId, view]);

  // Request canonical base URL from host, then rewrite all hash hrefs so the
  // browser status bar shows the mefly.dev URL instead of the github.io one.
  // Listener is registered first, request sent second — no race with useEffect.
  useEffect(() => {
    if (!isEmbedded) return;
    function onMessage(e: MessageEvent) {
      if (!isTrustedHost(e.origin)) return;
      if (e.data?.type !== 'SET_CANONICAL_URL') return;
      const url: string = e.data.url ?? '';
      if (!url) return;
      canonicalBaseRef.current = url.replace(/#.*$/, '');
      rewriteAllHashLinks(canonicalBaseRef.current);
    }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'REQUEST_CANONICAL_URL' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [isEmbedded]);

  // Rewrite hash hrefs on any newly added DOM nodes (MDX content is injected dynamically).
  useEffect(() => {
    if (!isEmbedded) return;
    const observer = new MutationObserver(mutations => {
      const base = canonicalBaseRef.current;
      if (!base) return;
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches('a[href^="#"]')) rewriteHashLink(el, base);
          el.querySelectorAll('a[href^="#"]').forEach(a => rewriteHashLink(a, base));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isEmbedded]);

  // Left-clicks on rewritten links must stay within the iframe (prevent cross-origin navigation).
  useEffect(() => {
    if (!isEmbedded) return;
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      const base = canonicalBaseRef.current;
      if (!base) return;
      const anchor = (e.target as Element).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith(base + '#')) return;
      e.preventDefault();
      window.location.hash = href.slice(base.length);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [isEmbedded]);

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

  const handleHelp = useCallback(() => {
    setHelpSeen(true);
    startTour();
  }, [setHelpSeen]);

  const catalogModelId = catalogSel?.forPageId === pageId ? catalogSel.modelId : undefined;
  const simId = pageSimIds[pageId] ?? catalogModelId;
  const modelId = pageModelIds[pageId] ?? catalogModelId;

  useEffect(() => {
    const prev = prevRouteRef.current;
    if (prev && prev.pageId !== pageId && prev.simId && prev.simId !== simId) {
      pauseSim(prev.simId);
    }
    prevRouteRef.current = { pageId, simId };
    if (simId) trackSim(simId);
  }, [pageId, simId]);

  return (
    <div className={`app-root${isEmbedded ? ' app-root--embedded' : ''}`}>
      <Group orientation="horizontal" className="app-h-group">

        {/* Left panel — Table of Contents */}
        <CollapsibleSidePanel
          position="left"
          title="Table of Contents"
          ContentComponent={() => (
            <div id="tour-toc">
              <TableOfContents pageIds={pageIds} currentPage={pageId} onNavigate={navigate} tocNames={pageTocNames} />
            </div>
          )}
          defaultSize="20%"
          minSize="10%"
        />

        <Separator className="app-h-separator" />

        {/* Main panel */}
        <Panel className="app-main-panel">

          {/* Tab bar */}
          <div id="tour-tab-bar" className="tab-bar">
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
              <div id="tour-content" style={{ display: 'contents' }}>
                {view === 'chapter' && <ChapterContent pageId={pageId} />}
                {view === 'src' && <SourceTab pageName={pageId} simId={simId} modelId={modelId} />}
                {view === 'blocks' && <BlocksTab pageName={pageId} simId={simId} modelId={modelId} />}
                {view === 'vis' && <VisualizationTab pageName={pageId} simId={simId} modelId={modelId} />}
              </div>
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
                  defaultCollapsed={true}
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

      {/* MeflyNav dots menu — receives nav items from host via postMessage */}
      <MeflyNavReceiver
        trustedOrigins={TRUSTED_ORIGINS}
        activationMode="hover"
        style={{
          left: '1rem',
          bottom: '1rem',
          '--mefly-nav-trigger-size': '2.15rem',
          '--mefly-nav-trigger-bg': 'var(--color-bg-elevated)',
          '--mefly-nav-trigger-bg-hover': 'var(--color-bg-active)',
          '--mefly-nav-trigger-color': 'var(--color-text)',
          '--mefly-nav-trigger-border': '1px solid var(--color-border)',
          '--mefly-nav-trigger-shadow': '0 4px 12px rgba(0,0,0,0.10)',
          '--mefly-nav-trigger-hover-transform': 'translateY(-1px)',
        } as React.CSSProperties}
      />

      {/* GitHub repo link */}
      <a
        className="repo-link"
        href={GITHUB_REPO}
        target="_blank"
        rel="noreferrer"
        aria-label="Open project repository on GitHub"
        title="GitHub repository"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 0.5C5.65 0.5 0.5 5.65 0.5 12c0 5.08 3.29 9.39 7.86 10.91 0.58 0.11 0.79-0.25 0.79-0.56 0-0.28-0.01-1.18-0.01-2.15-3.2 0.7-3.88-1.35-3.88-1.35-0.52-1.33-1.28-1.69-1.28-1.69-1.05-0.71 0.08-0.69 0.08-0.69 1.16 0.08 1.77 1.2 1.77 1.2 1.04 1.77 2.71 1.26 3.37 0.96 0.1-0.75 0.41-1.26 0.74-1.56-2.56-0.29-5.25-1.28-5.25-5.73 0-1.26 0.45-2.29 1.19-3.09-0.12-0.29-0.51-1.46 0.11-3.05 0 0 0.97-0.31 3.18 1.18a11.04 11.04 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18 0.62 1.59 0.23 2.76 0.11 3.05 0.74 0.8 1.19 1.83 1.19 3.09 0 4.46-2.69 5.43-5.26 5.72 0.42 0.36 0.79 1.06 0.79 2.14 0 1.55-0.01 2.79-0.01 3.17 0 0.31 0.21 0.68 0.8 0.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35 0.5 12 0.5z" />
        </svg>
      </a>

      {/* Help / tour button */}
      <button
        className={`help-btn${helpSeen ? '' : ' help-btn--glow'}`}
        onClick={handleHelp}
        title="Guided tour"
        aria-label="Start guided tour"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
        </svg>
      </button>
    </div>
  );
}
