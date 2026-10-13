import { useEffect, useId, useRef, useState } from 'react';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A "More" button that opens a short list of row actions, so tables don't carry three or four
 * buttons per row. Closes on choosing an item, clicking elsewhere or Escape.
 */
export default function RowMenu({ items, label = 'More actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  // Fixed-positioned from the button so the list isn't clipped by a scrolling table wrapper.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="row-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="secondary"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          const r = buttonRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open && pos && (
        <div className="row-menu-list" role="menu" id={menuId} style={{ top: pos.top, right: pos.right }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'row-menu-item is-danger' : 'row-menu-item'}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
