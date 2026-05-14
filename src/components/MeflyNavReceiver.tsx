import { useState, useRef, useEffect } from 'react';

interface NavItem {
  id: string;
  label: string;
  iconUrl: string;
  url: string;
  disabled?: boolean;
  devOnly?: boolean;
}

interface Props {
  trustedOrigins?: string[];
  allowLocalhost?: boolean;
  style?: React.CSSProperties;
  activationMode?: 'click' | 'hover';
}

function isTrusted(origin: string, trusted: string[], allowLocalhost: boolean): boolean {
  return trusted.includes(origin) || (allowLocalhost && /^https?:\/\/localhost(:\d+)?$/.test(origin));
}

export function MeflyNavReceiver({
  trustedOrigins = [],
  allowLocalhost = true,
  style,
  activationMode = 'click',
}: Props) {
  const [menu, setMenu] = useState<{ items: NavItem[]; activeId?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isTrusted(e.origin, trustedOrigins, allowLocalhost)) return;
      if (e.data?.type !== 'MEFLY_MENU') return;
      setMenu({ items: e.data.items, activeId: e.data.activeId });
    }
    window.addEventListener('message', onMessage);
    // Signal host that we're ready to receive the menu.
    if (window.parent !== window) window.parent.postMessage({ type: 'MEFLY_READY' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [trustedOrigins, allowLocalhost]);

  useEffect(() => {
    if (activationMode !== 'hover' || !ref.current) return;
    const el = ref.current;
    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    return () => { el.removeEventListener('mouseenter', show); el.removeEventListener('mouseleave', hide); };
  }, [activationMode, menu]);

  useEffect(() => {
    if (activationMode !== 'click' || !open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activationMode, open]);

  if (!menu || menu.items.length === 0) return null;

  const isEmbedded = window.parent !== window;

  function handleSelect(item: NavItem) {
    if (isEmbedded) window.parent.postMessage({ type: 'MEFLY_NAV_SELECT', item }, '*');
    setOpen(false);
  }

  return (
    <div ref={ref} className="mfly-nav-root" style={style}>
      {open && (
        <ul className="mfly-nav-menu">
          {menu.items.map(item => (
            <li key={item.id}>
              {item.disabled ? (
                <span className="mfly-nav-item mfly-nav-item--disabled">
                  <img src={item.iconUrl} alt="" className="mfly-nav-icon" />
                  <span className="mfly-nav-label">{item.label}</span>
                </span>
              ) : (
                <a
                  href={item.url}
                  className={[
                    'mfly-nav-item',
                    item.id === menu.activeId ? 'mfly-nav-item--active' : '',
                    item.devOnly ? 'mfly-nav-item--devonly' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={e => { e.preventDefault(); handleSelect(item); }}
                >
                  <img src={item.iconUrl} alt="" className="mfly-nav-icon" />
                  <span className="mfly-nav-label">{item.label}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        className="mfly-nav-trigger"
        onClick={activationMode === 'click' ? () => setOpen(o => !o) : undefined}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      </button>
    </div>
  );
}
