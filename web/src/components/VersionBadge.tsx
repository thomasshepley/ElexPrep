import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';

/**
 * Sidebar footer version number - click it to see the changelog. Shared between the admin/prep
 * shell (App.tsx) and the crew portal shell (CrewLayout.tsx).
 */
export default function VersionBadge() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.version.get>> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.version.get().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <>
      <button type="button" className="link-button sidebar-version" onClick={() => setOpen(true)}>
        v{data.version}
      </button>
      {open && (
        <Modal title="What's changed" onClose={() => setOpen(false)}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {data.changelog.map((entry) => (
              <div key={entry.version} style={{ marginBottom: '1rem' }}>
                <strong>
                  v{entry.version} <span className="muted" style={{ fontWeight: 400 }}>- {entry.date}</span>
                </strong>
                {entry.notes.length > 0 && (
                  <ul style={{ margin: '0.35rem 0 0' }}>
                    {entry.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                )}
                {(entry.sections ?? []).map((section) => (
                  <div key={section.title} className="changelog-section">
                    <div className="changelog-section-title">{section.title}</div>
                    <ul style={{ margin: '0.2rem 0 0' }}>
                      {section.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
            {data.changelog.length === 0 && <p className="muted">No changelog entries yet.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
