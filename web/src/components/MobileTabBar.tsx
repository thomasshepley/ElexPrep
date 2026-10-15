import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { ChevronRightIcon, MoreIcon } from './Icons';

export interface MobileTab {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export interface MoreSheetLink {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * The phone navigation: a floating, rounded tab bar inset from the screen edges (so curved
 * iPhone corners never clip the outer tabs) with at most four tabs - the main destinations,
 * Alerts, and, when there are more places to go, a "More" tab that opens a bottom sheet.
 */
export default function MobileTabBar({
  tabs,
  after = [],
  more,
}: {
  tabs: MobileTab[];
  /** Tabs placed after Alerts (e.g. the crew's Account tab). */
  after?: MobileTab[];
  more?: { header?: ReactNode; links: MoreSheetLink[]; footer?: ReactNode };
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const moreActive = Boolean(more?.links.some((l) => location.pathname.startsWith(l.to)));

  // Any navigation closes the sheet.
  useEffect(() => setSheetOpen(false), [location.pathname]);

  return (
    <>
      <nav className="mobile-tabbar" aria-label="Main">
        {tabs.map((t) => (
          <TabLink key={t.to} tab={t} />
        ))}
        <NotificationBell variant="tab" />
        {after.map((t) => (
          <TabLink key={t.to} tab={t} />
        ))}
        {more && (
          <button type="button" className={`mobile-tab${moreActive || sheetOpen ? ' active' : ''}`} aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
            <span className="mobile-tab-icon">
              <MoreIcon />
            </span>
            <span className="mobile-tab-label">More</span>
          </button>
        )}
      </nav>
      {more && sheetOpen && <MoreSheet {...more} onClose={() => setSheetOpen(false)} />}
    </>
  );
}

function TabLink({ tab }: { tab: MobileTab }) {
  return (
    <NavLink to={tab.to} end={tab.end} className="mobile-tab">
      <span className="mobile-tab-icon">{tab.icon}</span>
      <span className="mobile-tab-label">{tab.label}</span>
    </NavLink>
  );
}

function MoreSheet({ header, links, footer, onClose }: { header?: ReactNode; links: MoreSheetLink[]; footer?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        {header}
        <ul className="sheet-list">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className="sheet-row">
                <span className="sheet-row-icon">{l.icon}</span>
                <span className="sheet-row-label">{l.label}</span>
                <ChevronRightIcon />
              </NavLink>
            </li>
          ))}
        </ul>
        {footer}
      </div>
    </div>,
    document.body
  );
}
