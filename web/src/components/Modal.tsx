import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * A plain floating overlay — the first modal pattern in this codebase (everywhere else reveals
 * detail inline via expand/collapse, see CrewJobPage's info-card-trigger). Closes on backdrop
 * click or Escape, matching ordinary dialog expectations.
 */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="secondary" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
