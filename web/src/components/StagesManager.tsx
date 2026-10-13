import { useEffect, useState } from 'react';
import { api, type FixtureGroup, type RmsHeadingGroup } from '../api/client';
import Modal from './Modal';
import { useToast } from './Toast';
import { useDialog } from './Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';

/**
 * CRUD + Current RMS cross-reference for a job's "stages" (FixtureGroup rows) - opened from
 * JobPrepTab's stage bar. Creating a stage from an RMS heading also auto-assigns every
 * currently-ungrouped fixture whose type name matches something under that heading (see
 * routes/fixtureGroups.ts's loose name match) - the admin reviews the result afterward in the
 * normal Patch Import fixtures list, same as any other edit.
 */
export default function StagesManager({
  jobId,
  groups,
  onChanged,
  onClose,
}: {
  jobId: string;
  groups: FixtureGroup[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const dialog = useDialog();
  const { run } = useAsyncAction();
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [headings, setHeadings] = useState<RmsHeadingGroup[] | null>(null);
  const [headingsError, setHeadingsError] = useState<string | null>(null);
  const [headingsBusy, setHeadingsBusy] = useState(false);
  const [selectedHeadings, setSelectedHeadings] = useState<Set<string>>(new Set());

  const createdHeadingNames = new Set(groups.map((g) => g.rmsGroupName).filter((n): n is string => Boolean(n)));

  const addCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.fixtureGroups.create(jobId, newName.trim());
      setNewName('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    const name = renaming[id];
    if (!name || !name.trim()) return;
    await api.fixtureGroups.update(jobId, id, { name: name.trim() });
    setRenaming((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
    onChanged();
  };

  const remove = async (group: FixtureGroup) => {
    if (!(await dialog.confirm({ title: `Delete stage "${group.name}"?`, message: 'Its fixtures, cases and labels become ungrouped - nothing else is deleted.', confirmLabel: 'Delete stage', danger: true }))) return;
    if ((await run(() => api.fixtureGroups.remove(jobId, group.id).then(() => true))) !== true) return;
    onChanged();
  };

  const rematch = async (group: FixtureGroup) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.fixtureGroups.rematch(jobId, group.id);
      showToast(`Matched ${res.matched} more fixture${res.matched === 1 ? '' : 's'} to "${group.name}"`);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadHeadings = async () => {
    setHeadingsBusy(true);
    setHeadingsError(null);
    try {
      setHeadings(await api.fixtureGroups.rmsHeadings(jobId));
    } catch (err) {
      setHeadingsError((err as Error).message);
    } finally {
      setHeadingsBusy(false);
    }
  };

  useEffect(() => {
    loadHeadings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const toggleHeading = (name: string) => {
    setSelectedHeadings((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const createFromHeadings = async () => {
    if (selectedHeadings.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.fixtureGroups.createFromRms(jobId, [...selectedHeadings]);
      showToast(`Created ${res.groups.length} stage${res.groups.length === 1 ? '' : 's'}, matched ${res.totalMatched} fixture${res.totalMatched === 1 ? '' : 's'}`);
      setSelectedHeadings(new Set());
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Manage stages" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Split this job's patch import, cases and labels into named stages - useful for
        multi-stage events where each stage needs its own self-contained prep run.
      </p>

      {error && <p className="error">{error}</p>}

      {groups.length > 0 && (
        <div className="table-scroll">
          <table style={{ marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th>Stage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    <input
                      value={renaming[g.id] ?? g.name}
                      onChange={(e) => setRenaming((r) => ({ ...r, [g.id]: e.target.value }))}
                      onBlur={() => renaming[g.id] !== undefined && renaming[g.id] !== g.name && rename(g.id)}
                      style={{ width: 200 }}
                    />
                    {g.rmsGroupName && <span className="muted" style={{ marginLeft: '0.5rem' }}>from Current RMS</span>}
                  </td>
                  <td>
                    <div className="row">
                      {g.rmsGroupName && (
                        <button className="secondary" disabled={busy} onClick={() => rematch(g)}>
                          Re-match from RMS
                        </button>
                      )}
                      <button className="secondary" disabled={busy} onClick={() => remove(g)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>Add a custom stage</h4>
      <form className="row" onSubmit={addCustom}>
        <input aria-label="Stage name" placeholder="Stage name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>

      <h4 style={{ marginTop: '1.25rem' }}>Create stages from Current RMS headings</h4>
      {headingsBusy && <p className="muted">Loading…</p>}
      {headingsError && <p className="error">{headingsError}</p>}
      {headings !== null && headings.length === 0 && !headingsError && (
        <p className="muted">No section headings found on this job's linked opportunity.</p>
      )}
      {headings !== null && headings.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick which of this opportunity's own section headings are stages - fixtures already
            imported whose type matches an item under that heading are assigned automatically.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
            {headings.map((h) => (
              <label key={h.name} className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedHeadings.has(h.name)}
                  disabled={createdHeadingNames.has(h.name)}
                  onChange={() => toggleHeading(h.name)}
                />
                {h.name} <span className="muted">({h.itemNames.length} items)</span>
                {createdHeadingNames.has(h.name) && <span className="muted">- already a stage</span>}
              </label>
            ))}
          </div>
          <button disabled={busy || selectedHeadings.size === 0} onClick={createFromHeadings}>
            Create {selectedHeadings.size > 0 ? `${selectedHeadings.size} ` : ''}stage{selectedHeadings.size === 1 ? '' : 's'}
          </button>
        </>
      )}
    </Modal>
  );
}
