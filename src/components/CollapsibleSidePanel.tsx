import { Panel, usePanelRef } from 'react-resizable-panels';
import type { PanelSize } from 'react-resizable-panels';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (defaultCollapsed) panelRef.current?.collapse();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    panelRef.current?.isCollapsed()
      ? panelRef.current.expand()
      : panelRef.current?.collapse();
  }

  function handleResize(_size: PanelSize) {
    setCollapsed(panelRef.current?.isCollapsed() ?? false);
  }

  const arrow = collapsed ? EXPAND_ARROW[position] : COLLAPSE_ARROW[position];
  const isVertical = position === 'left' || position === 'right';

  return (
    <Panel
      panelRef={panelRef}
      defaultSize={defaultSize}
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
          <div className={`${styles.titleBar} ${styles[`titleBar--${position}`]}`}>
            <button
              onClick={toggle}
              className={styles.toggleBtn}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
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
