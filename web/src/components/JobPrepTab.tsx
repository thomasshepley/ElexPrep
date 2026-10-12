import { useEffect, useState } from 'react';
import { api, type FixtureGroup } from '../api/client';
import PatchImportPanel from './PatchImportPanel';
import CasesPanel from './CasesPanel';
import LabelsPanel from './LabelsPanel';
import PrintQueuePanel from './PrintQueuePanel';
import StagesManager from './StagesManager';

const PREP_TABS = ['Patch Import', 'Cases', 'Labels', 'Print Queue'] as const;
type PrepTab = (typeof PREP_TABS)[number];

/**
 * Patch Import / Cases / Labels / Print Queue combined under one "Prep" tab, switching via
 * sub-tabs - these four used to be separate top-level tabs, which got messy since they're all
 * steps of the same prep workflow (import fixtures, pack cases, generate labels, print them).
 *
 * The stage bar above the sub-tabs only appears once the job has at least one FixtureGroup
 * ("stage") - a job that never uses stages looks and behaves exactly as before. Once stages
 * exist, picking one here scopes every sub-tab below to it: Patch Import only shows/replaces
 * that stage's fixtures, Cases only regenerates that stage's cases, and so on - see
 * routes/fixtureGroups.ts for the full model.
 */
export default function JobPrepTab({ jobId }: { jobId: string }) {
  const [tab, setTab] = useState<PrepTab>('Patch Import');
  const [groups, setGroups] = useState<FixtureGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [managingStages, setManagingStages] = useState(false);

  const refreshGroups = () => api.fixtureGroups.list(jobId).then(setGroups);

  useEffect(() => {
    refreshGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const hasStages = groups.length > 0;

  return (
    <div>
      {hasStages && (
        <div className="row tabs tabs-sub" style={{ marginBottom: '0.5rem' }}>
          <button className={activeGroupId === null ? 'active' : ''} onClick={() => setActiveGroupId(null)}>
            Ungrouped
          </button>
          {groups.map((g) => (
            <button key={g.id} className={activeGroupId === g.id ? 'active' : ''} onClick={() => setActiveGroupId(g.id)}>
              {g.name}
            </button>
          ))}
          <button className="secondary" onClick={() => setManagingStages(true)}>
            Manage stages
          </button>
        </div>
      )}
      {!hasStages && (
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          <button className="secondary" onClick={() => setManagingStages(true)}>
            + Split into stages
          </button>{' '}
          - for multi-stage jobs that need a separate patch import/cases/labels run per stage.
        </p>
      )}

      {managingStages && (
        <StagesManager
          jobId={jobId}
          groups={groups}
          onChanged={refreshGroups}
          onClose={() => setManagingStages(false)}
        />
      )}

      <div className="tabs tabs-sub">
        {PREP_TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Patch Import' && <PatchImportPanel jobId={jobId} groupId={activeGroupId} />}
      {tab === 'Cases' && <CasesPanel jobId={jobId} groupId={activeGroupId} />}
      {tab === 'Labels' && <LabelsPanel jobId={jobId} groupId={activeGroupId} />}
      {tab === 'Print Queue' && <PrintQueuePanel jobId={jobId} groupId={activeGroupId} />}
    </div>
  );
}
