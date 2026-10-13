import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AppNotification } from '../api/client';
import { BellIcon } from './Icons';

const POLL_MS = 30000;

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Polling notification bell - shared by the admin and crew sidebars. Self-contained: it owns its own open/unread state and only needs to be dropped into a sidebar. */
export default function NotificationBell({ variant = 'sidebar' }: { variant?: 'sidebar' | 'tab' }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refreshCount = () => api.notifications.unreadCount().then((r) => setUnread(r.count)).catch(() => {});

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    api.notifications.list().then(setItems).catch(() => setItems([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    }
    setOpen((o) => !o);
  };

  const openItem = async (n: AppNotification) => {
    if (!n.readAt) {
      await api.notifications.markRead(n.id);
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead();
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
    setUnread(0);
  };

  return (
    <div className={`notification-bell${variant === 'tab' ? ' is-tab' : ''}`} ref={rootRef}>
      {variant === 'tab' ? (
        <button
          ref={buttonRef}
          type="button"
          className={`mobile-tab${open ? ' active' : ''}`}
          onClick={toggleOpen}
          aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
          aria-expanded={open}
        >
          <span className="mobile-tab-icon">
            <BellIcon />
            {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
          </span>
          <span className="mobile-tab-label">Alerts</span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          className="secondary sidebar-signout"
          onClick={toggleOpen}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          aria-expanded={open}
        >
          <BellIcon />
          <span>Notifications</span>
          {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
      {open && panelPos && (
        <div className={`notification-panel${variant === 'tab' ? ' is-sheet' : ''}`} style={variant === 'tab' ? undefined : { left: panelPos.left, bottom: panelPos.bottom }}>
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            {items && items.some((i) => !i.readAt) && (
              <button className="secondary" style={{ padding: '0.1rem 0.5rem', fontSize: 'var(--text-xs)' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {items === null && <p className="muted" style={{ padding: '0.75rem' }}>Loading…</p>}
          {items !== null && items.length === 0 && <p className="muted" style={{ padding: '0.75rem' }}>No notifications yet.</p>}
          {items !== null &&
            items.map((n) => (
              <button key={n.id} className={`notification-item${n.readAt ? '' : ' is-unread'}`} onClick={() => openItem(n)}>
                <div className="notification-item-title">{n.title}</div>
                {n.body && <div className="notification-item-body">{n.body}</div>}
                <div className="notification-item-time">{formatRelative(n.createdAt)}</div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
