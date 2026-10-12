import { useState } from 'react';
import PatchImportPanel from './PatchImportPanel';
import CasesPanel from './CasesPanel';
import LabelsPanel from './LabelsPanel';
import PrintQueuePanel from './PrintQueuePanel';

const PREP_TABS = ['Patch Import', 'Cases', 'Labels', 'Print Queue'] as const;
type PrepTab = (typeof PREP_TABS)[number];

/**
 * Patch Import / Cases / Labels / Print Queue combined under one "Prep" tab, switching via
 * sub-tabs — these four used to be separate top-level tabs, which got messy since they're all
 * steps of the same prep workflow (import fixtures, pack cases, generate labels, print them).
 */
export default function JobPrepTab({ jobId }: { jobId: string }) {
  const [tab, setTab] = useState<PrepTab>('Patch Import');

  return (
    <div>
      <div className="tabs tabs-sub">
        {PREP_TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Patch Import' && <PatchImportPanel jobId={jobId} />}
      {tab === 'Cases' && <CasesPanel jobId={jobId} />}
      {tab === 'Labels' && <LabelsPanel jobId={jobId} />}
      {tab === 'Print Queue' && <PrintQueuePanel jobId={jobId} />}
    </div>
  );
}
