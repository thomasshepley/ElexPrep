import { useEffect, useState } from 'react';
import { api, type CaseGroup } from '../api/client';

export default function CasesPanel({ jobId }: { jobId: string }) {
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

  const generate = async () => {
    if (
      cases.length > 0 &&
      !confirm(
        `This replaces all ${cases.length} case row(s) below with a fresh set built from the current patch and case rules - any manual edits or additions will be lost. Continue?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.cases.generate(jobId);
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
    if (!confirm('Delete this case row?')) return;
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
    setSelected((s) => (s.size === cases.length ? new Set() : new Set(cases.map((c) => c.id))));
  };

  const bulkSetLocation = async () => {
    await api.cases.bulkSetLocation(jobId, [...selected], bulkLocation);
    setBulkLocation('');
    setSelected(new Set());
    refresh();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} selected case rows?`)) return;
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
      await api.cases.create(jobId, { fixtureType: newType, label: newLabel, location: newLocation || undefined });
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
        Groups fixtures into cases using the units-per-case rule for each fixture type. Every
        field below is editable in place (click and type, saves on blur); use Regenerate after
        importing a new patch or editing case rules - it replaces every row here, so add any
        one-off cases below afterwards rather than before.
      </p>
      {cases.length === 0 && <p className="muted">No cases yet - generate from the patch, or add one below.</p>}
      {cases.length > 0 && (
        <>
          {selected.size > 0 && (
            <div className="row panel" style={{ background: 'rgba(255,255,255,0.04)', alignItems: 'center', gap: '0.6rem' }}>
              <strong>{selected.size} selected</strong>
              <input
                placeholder="Set location to…"
                value={bulkLocation}
                onChange={(e) => setBulkLocation(e.target.value)}
                style={{ width: 160 }}
              />
              <button onClick={bulkSetLocation}>Set location</button>
              <button className="secondary" onClick={bulkDelete}>
                Delete selected
              </button>
              <button className="secondary" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selected.size === cases.length && cases.length > 0}
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
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                  </td>
                  <td>
                    <input
                      defaultValue={c.fixtureType}
                      onBlur={(e) => updateField(c, 'fixtureType', e.target.value)}
                    />
                  </td>
                  <td>
                    <input defaultValue={c.label} onBlur={(e) => updateField(c, 'label', e.target.value)} />
                  </td>
                  <td>
                    <input
                      defaultValue={c.location ?? ''}
                      onBlur={(e) => updateField(c, 'location', e.target.value)}
                    />
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
        </>
      )}

      <h4 style={{ marginTop: '1.25rem' }}>Add a case</h4>
      <form className="row" onSubmit={addCase}>
        <input placeholder="Fixture type" value={newType} onChange={(e) => setNewType(e.target.value)} />
        <input placeholder="Case label (e.g. 501 + 502)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <input placeholder="Location (optional)" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
        <button type="submit">Add case</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
