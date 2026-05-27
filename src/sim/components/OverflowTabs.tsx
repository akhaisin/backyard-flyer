import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import styles from './OverflowTabs.module.css';

export interface OverflowTab {
  id: string;
  label: string;
  marked?: boolean;
}

interface Props {
  tabs: OverflowTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

const MORE_BTN_W = 64;

export default function OverflowTabs({ tabs, activeId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement>(null);

  // Display order — can differ from props order after a swap
  const [tabOrder, setTabOrder] = useState<string[]>(() => tabs.map(t => t.id));

  // Sync tabOrder when tabs are added/removed (keep custom positions, append new at end)
  const tabKey = tabs.map(t => `${t.id}:${t.label}`).join('\0');
  useLayoutEffect(() => {
    setTabOrder(prev => {
      const newIds = tabs.map(t => t.id);
      const newSet = new Set(newIds);
      const kept = prev.filter(id => newSet.has(id));
      const added = newIds.filter(id => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [tabKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive display-ordered tabs from the order state
  const tabMap = new Map(tabs.map(t => [t.id, t]));
  const orderedTabs = tabOrder.map(id => tabMap.get(id)).filter((t): t is OverflowTab => t !== undefined);

  // Always-fresh recalc — avoids stale closure in ResizeObserver
  const recalcRef = useRef<() => void>(() => {});
  recalcRef.current = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.clientWidth - 16; // subtract 8px left/right padding
    const widths = orderedTabs.map(t => {
      const el = measureRefs.current.get(t.id);
      return el ? el.offsetWidth + 2 : 80; // +2 for gap
    });
    const total = widths.reduce((s, w) => s + w, 0);
    let next: string[];
    if (total <= containerW) {
      next = [];
    } else {
      const budget = containerW - MORE_BTN_W;
      let used = 0;
      let splitAt = orderedTabs.length;
      for (let i = 0; i < orderedTabs.length; i++) {
        if (used + widths[i] > budget) { splitAt = i; break; }
        used += widths[i];
      }
      next = orderedTabs.slice(splitAt).map(t => t.id);
    }
    setOverflowIds(prev =>
      prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next,
    );
  };

  // Recalc whenever display order changes (covers initial mount, swaps, and tab list changes)
  useLayoutEffect(() => { recalcRef.current(); }, [tabOrder]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recalcRef.current());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreWrapRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const overflowSet = new Set(overflowIds);
  const overflowTabs = orderedTabs.filter(t => overflowSet.has(t.id));

  const handleSelect = (id: string) => {
    if (overflowSet.has(id)) {
      // Swap selected tab into the last visible position so it appears in the tab bar
      setTabOrder(prev => {
        const container = containerRef.current;
        if (!container) return prev;
        const containerW = container.clientWidth - 16;
        const widths = prev.map(tid => {
          const el = measureRefs.current.get(tid);
          return el ? el.offsetWidth + 2 : 80;
        });
        const total = widths.reduce((s, w) => s + w, 0);
        if (total <= containerW) return prev;
        const budget = containerW - MORE_BTN_W;
        let used = 0;
        let splitAt = prev.length;
        for (let i = 0; i < prev.length; i++) {
          if (used + widths[i] > budget) { splitAt = i; break; }
          used += widths[i];
        }
        if (splitAt === 0) return prev;
        const lastVisibleIdx = splitAt - 1;
        const selectedIdx = prev.indexOf(id);
        if (selectedIdx < 0 || selectedIdx <= lastVisibleIdx) return prev;
        const next = [...prev];
        next[lastVisibleIdx] = id;
        next[selectedIdx] = prev[lastVisibleIdx];
        return next;
      });
    }
    onSelect(id);
    setMoreOpen(false);
  };

  return (
    <div className={styles.outer}>
      {/* Hidden measurement container — all tabs at natural width, never painted */}
      <div className={`${styles.tabBar} ${styles.measure}`} aria-hidden="true">
        {orderedTabs.map(t => (
          <button
            key={t.id}
            ref={el => { if (el) measureRefs.current.set(t.id, el); else measureRefs.current.delete(t.id); }}
            className={styles.tab}
            tabIndex={-1}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Visible tab bar — only non-overflow tabs */}
      <div className={styles.tabBar} ref={containerRef}>
        {orderedTabs.filter(t => !overflowSet.has(t.id)).map(t => (
          <button
            key={t.id}
            className={[
              styles.tab,
              activeId === t.id ? styles.tabActive : '',
              t.marked ? styles.tabMarked : '',
            ].filter(Boolean).join(' ')}
            onClick={() => handleSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
        {overflowIds.length > 0 && (
          <div ref={moreWrapRef} className={styles.moreWrap}>
            <button
              className={styles.tab}
              onClick={() => setMoreOpen(o => !o)}
            >
              More ▾
            </button>
            {moreOpen && (
              <div className={styles.dropdown}>
                {overflowTabs.map(t => (
                  <button
                    key={t.id}
                    className={[
                      styles.item,
                      activeId === t.id ? styles.itemActive : '',
                      t.marked ? styles.itemMarked : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleSelect(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
