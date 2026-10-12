import { useEffect, useState } from 'react';
import InlinePdfViewer from './InlinePdfViewer';

export interface CadPlotCandidate {
  key: string;
  label: string;
  url: string;
  badge?: string;
}

/**
 * Unified CAD view for a job: the auto-detected OneDrive CAD PDF, manually uploaded Plot PDFs,
 * and any OneDrive share explicitly flagged as a CAD plot are all candidates here. With more
 * than one (a multi-stage job with a plot per stage), they switch via tabs instead of a flat
 * list the viewer has to click through one at a time.
 */
export default function CadPlotsViewer({ candidates }: { candidates: CadPlotCandidate[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(candidates[0]?.key ?? null);

  useEffect(() => {
    if (!candidates.some((c) => c.key === activeKey)) setActiveKey(candidates[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.map((c) => c.key).join(',')]);

  if (candidates.length === 0) return <p className="muted">No CAD plots yet.</p>;

  const active = candidates.find((c) => c.key === activeKey) ?? candidates[0];

  return (
    <div>
      {candidates.length > 1 && (
        <div className="tabs tabs-sub">
          {candidates.map((c) => (
            <button key={c.key} className={c.key === active.key ? 'active' : ''} onClick={() => setActiveKey(c.key)}>
              {c.label}
              {c.badge && <span className="chip chip-neutral" style={{ marginLeft: '0.4rem' }}>{c.badge}</span>}
            </button>
          ))}
        </div>
      )}
      <InlinePdfViewer url={active.url} title={active.label} />
    </div>
  );
}
