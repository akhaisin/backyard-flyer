import { Panel, usePanelRef } from 'react-resizable-panels';
import type { PanelSize } from 'react-resizable-panels';
import { useRef, useState } from 'react';
import styles from './CollapsibleSidePanel.module.css';

export type PanelPosition = 'left' | 'right' | 'bottom';

export interface Props {
  position: PanelPosition;
  title?: string;
  ContentComponent: React.ComponentType;
  defaultSize?: string;
  minSize?: string;
  defaultCollapsed?: boolean;
}

const COLLAPSED_SIZE = 32;

const EXPAND_ARROW:   Record<PanelPosition, string> = { left: '›', right: '‹', bottom: '∧' };
const COLLAPSE_ARROW: Record<PanelPosition, string> = { left: '‹', right: '›', bottom: '∨' };

export default function CollapsibleSidePanel({
  position,
  title,
  ContentComponent,
  defaultSize = '20%',
  minSize = '10%',
  defaultCollapsed = false,
}: Props) {
  const panelRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // expand() restores the size recorded by collapse(); when the panel starts
  // collapsed there is no recorded size, so the first expand targets defaultSize.
  const hasExpandedRef = useRef(!defaultCollapsed);

  function toggle() {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      hasExpandedRef.current ? panel.expand() : panel.resize(defaultSize);
    } else {
      panel.collapse();
    }
  }

  function handleResize(_size: PanelSize) {
    const isCollapsed = panelRef.current?.isCollapsed() ?? false;
    if (!isCollapsed) hasExpandedRef.current = true;
    setCollapsed(isCollapsed);
  }

  const arrow = collapsed ? EXPAND_ARROW[position] : COLLAPSE_ARROW[position];
  const isVertical = position === 'left' || position === 'right';

  return (
    <Panel
      panelRef={panelRef}
      defaultSize={defaultCollapsed ? COLLAPSED_SIZE : defaultSize}
      minSize={minSize}
      collapsible
      collapsedSize={COLLAPSED_SIZE}
      onResize={handleResize}
      className={`${styles.panel} ${styles[`panel--${position}`]}`}
      style={{ overflow: 'hidden' }}
    >
      {isVertical && collapsed ? (
        /* ── Collapsed vertical bar ── */
        <div className={styles.collapsedBar} onClick={toggle} title="Expand">
          <button className={styles.toggleBtn} tabIndex={-1} aria-hidden>
            {arrow}
          </button>
          {title && <span className={styles.titleVertical}>{title}</span>}
        </div>
      ) : (
        /* ── Expanded (all positions) or collapsed bottom ── */
        <>
          <div
            className={`${styles.titleBar} ${styles[`titleBar--${position}`]}`}
            onClick={toggle}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <button className={styles.toggleBtn} tabIndex={-1} aria-hidden>
              {arrow}
            </button>
            {title && <span className={styles.titleText}>{title}</span>}
          </div>
          {!collapsed && (
            <div className={styles.body}>
              <ContentComponent />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
