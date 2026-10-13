import { useEffect, useState } from 'react';
import { api, type CaseGroup } from '../api/client';
import { useDialog } from './Dialog';
import InlineEdit from './InlineEdit';
import LocationSelect, { useJobLocations } from './LocationSelect';

export default function CasesPanel({ jobId, groupId = null }: { jobId: string; groupId?: string | null }) {
  const dialog = useDialog();
  const [cases, setCases] = useState<CaseGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState('');

  const refresh = () => api.cases.list(jobId).then(setCases);

  useEffect(() => {
    refresh();
  }, [jobId]);

  const stageCases = cases.filter((c) => (c.groupId ?? null) === groupId);
  const locationOptions = useJobLocations(jobId, cases.map((c) => c.location));

  const generate = async () => {
    if (
      stageCases.length > 0 &&
      !(await dialog.confirm({
        title: 'Regenerate cases?',
        message: `This replaces all ${stageCases.length} case row(s) with a fresh set built from the current patch and case rules - any manual edits or additions will be lost.`,
        confirmLabel: 'Regenerate',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.cases.generate(jobId, groupId);
      setSelected(new Set());
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const updateField = async (c: CaseGroup, field: 'fixtureType' | 'label' | 'location', value: string) => {
    if (value === (c[field] ?? '')) return;
    await api.cases.update(jobId, c.id, { [field]: value });
    refresh();
  };

  const remove = async (id: string) => {
    if (!(await dialog.confirm({ title: 'Delete this case?', confirmLabel: 'Delete', danger: true }))) return;
    await api.cases.remove(jobId, id);
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    refresh();
  };

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((s) => (s.size === stageCases.length ? new Set() : new Set(stageCases.map((c) => c.id))));
  };

  const bulkSetLocation = async () => {
    await api.cases.bulkSetLocation(jobId, [...selected], bulkLocation);
    setBulkLocation('');
    setSelected(new Set());
    refresh();
  };

  const bulkDelete = async () => {
    if (!(await dialog.confirm({ title: `Delete ${selected.size} cases?`, confirmLabel: 'Delete', danger: true }))) return;
    await api.cases.bulkRemove(jobId, [...selected]);
    setSelected(new Set());
    refresh();
  };

  const addCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newType.trim() || !newLabel.trim()) {
      setError('Fixture type and case label are required');
      return;
    }
    try {
      await api.cases.create(jobId, { fixtureType: newType, label: newLabel, location: newLocation || undefined, groupId });
      setNewType('');
      setNewLabel('');
      setNewLocation('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Case groups (PAL labels)</h3>
        <button onClick={generate} disabled={busy}>
          Regenerate from patch + case rules
        </button>
      </div>
      <p className="muted">
        Groups fixtures into cases using the units-per-case rule for each fixture type. Click any
        value below to edit it; use Regenerate after
        importing a new patch or editing case rules - it replaces every row here, so add any
        one-off cases below afterwards rather than before.
      </p>
      {stageCases.length === 0 && <p className="muted">No cases yet - generate from the patch, or add one below.</p>}
      {stageCases.length > 0 && (
        <>
          {selected.size > 0 && (
            <div className="row panel" style={{ background: 'rgba(255,255,255,0.04)', alignItems: 'center', gap: '0.6rem' }}>
              <strong>{selected.size} selected</strong>
              <LocationSelect ariaLabel="Set location to" placeholder="Set location to…" value={bulkLocation} options={locationOptions} onChange={setBulkLocation} width="12rem" />
              <button onClick={bulkSetLocation}>Set location</button>
              <button className="secondary" onClick={bulkDelete}>
                Delete selected
              </button>
              <button className="secondary" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selected.size === stageCases.length && stageCases.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Fixture type</th>
                  <th>Case label</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stageCases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                    </td>
                    <td>
                      <InlineEdit label="Fixture type" value={c.fixtureType} onSave={(v) => updateField(c, 'fixtureType', v)} />
                    </td>
                    <td>
                      <InlineEdit label="Case label" value={c.label} onSave={(v) => updateField(c, 'label', v)} />
                    </td>
                    <td>
                      <LocationSelect ariaLabel={`Location for ${c.label}`} value={c.location ?? ''} options={locationOptions} onChange={(v) => updateField(c, 'location', v)} />
                    </td>
                    <td>
                      <button className="secondary" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4 style={{ marginTop: '1.25rem' }}>Add a case</h4>
      <form className="row" onSubmit={addCase}>
        <input aria-label="Fixture type" placeholder="Fixture type" value={newType} onChange={(e) => setNewType(e.target.value)} />
        <input aria-label="Case label" placeholder="Case label (e.g. 501 + 502)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <LocationSelect ariaLabel="Location" placeholder="Location (optional)" value={newLocation} options={locationOptions} onChange={setNewLocation} width="12rem" />
        <button type="submit">Add case</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
