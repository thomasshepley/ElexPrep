import { useEffect, useState } from 'react';
import type { DataConnector, PowerConnector } from '@elexprep/shared';
import { api, type FixtureProfile, type FixtureProfileInput } from '../api/client';
import { useDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SkeletonTableRows } from '../components/Skeleton';

const POWER_LABEL: Record<PowerConnector, string> = { CEE16: '16A', TRUE1: 'TRUE1', POWERCON: 'powerCON', OTHER: 'Other' };
const DATA_LABEL: Record<DataConnector, string> = { DMX5: '5-pin DMX', DMX3: '3-pin DMX', ETHERCON: 'RJ45 / etherCON' };

/** Settings > Fixture database (admin): power, connectors and weights per fixture, for the cable and rigging calculators. */
export default function FixtureDatabasePage() {
  return (
    <div>
      <h1>Fixture database</h1>
      <p className="muted">Used by the Cable (beta) and Rigging (beta) tabs. Both are in beta and only admins can see them for now.</p>
      <ProfilesPanel />
    </div>
  );
}

const EMPTY: FixtureProfileInput = {
  displayName: '',
  watts: 0,
  amps: null,
  powerConnector: 'TRUE1',
  hasPowerThru: false,
  dataConnector: 'DMX5',
  hasDataThru: false,
  maxPerLine: null,
  inrushA: null,
  aliases: null,
  notes: null,
  weightKg: null,
  clampKg: null,
};

function ProfilesPanel() {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<FixtureProfile[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; data: FixtureProfileInput } | null>(null);
  const [filter, setFilter] = useState('');

  const load = () =>
    api.cable
      .profiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  useEffect(() => {
    void load();
  }, []);

  const shown = (profiles ?? []).filter((p) => !filter || `${p.displayName} ${p.aliases ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Fixtures</h2>
        <button type="button" onClick={() => setEditing({ id: null, data: { ...EMPTY } })}>
          Add fixture
        </button>
      </div>
      <p className="muted">
        Matched to the patch by name; a patch name without the maker ("Aura XB") still matches. Add other names the patch uses under Also called. Entries noted
        unverified came from dealer listings: check them against the manual.
      </p>
      <input className="cable-filter" placeholder="Search fixtures" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search fixtures" />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fixture</th>
              <th className="num">Watts</th>
              <th className="num">Weight</th>
              <th>Power</th>
              <th>Data</th>
              <th>Notes</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!profiles && <SkeletonTableRows rows={6} cols={7} />}
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.displayName}</strong>
                  {p.aliases && <div className="muted">Also called {p.aliases}</div>}
                </td>
                <td className="num">{p.watts}</td>
                <td className="num">{p.weightKg !== null ? `${p.weightKg} kg` : <span className="muted">Not set</span>}</td>
                <td>
                  {POWER_LABEL[p.powerConnector]}
                  {p.hasPowerThru ? ', thru' : ''}
                  {p.maxPerLine ? `, ${p.maxPerLine} per line` : ''}
                  {p.inrushA ? `, ${p.inrushA} A inrush` : ''}
                </td>
                <td>
                  {DATA_LABEL[p.dataConnector]}
                  {p.hasDataThru ? ', RJ45 in and out' : ''}
                </td>
                <td className="muted">{p.notes}</td>
                <td className="row-actions">
                  <button type="button" className="secondary" onClick={() => setEditing({ id: p.id, data: { ...p } })}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={async () => {
                      if (!(await dialog.confirm({ title: `Delete ${p.displayName}?`, confirmLabel: 'Delete', danger: true }))) return;
                      await api.cable.deleteProfile(p.id).catch((e) => showToast((e as Error).message, 'error'));
                      void load();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ProfileForm
          initial={editing.data}
          title={editing.id ? `Edit ${editing.data.displayName}` : 'Add a fixture'}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing.id) await api.cable.updateProfile(editing.id, data);
            else await api.cable.createProfile(data);
            setEditing(null);
            showToast('Saved', 'success');
            void load();
          }}
        />
      )}
    </section>
  );
}

function ProfileForm({ initial, title, onClose, onSave }: { initial: FixtureProfileInput; title: string; onClose: () => void; onSave: (d: FixtureProfileInput) => Promise<void> }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const optNum = (v: string) => (v.trim() === '' ? null : Number(v));
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSave(d);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field profile-form-full">
          <span className="field-label">Name</span>
          <input value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} placeholder="e.g. Robe Spiider" required />
        </label>
        <label className="field">
          <span className="field-label">Maximum watts at 230 V</span>
          <input type="number" min={0} value={d.watts} onChange={(e) => setD({ ...d, watts: Number(e.target.value) })} required />
        </label>
        <label className="field">
          <span className="field-label">Inrush (A)</span>
          <input type="number" min={0} step={0.1} value={d.inrushA ?? ''} onChange={(e) => setD({ ...d, inrushA: optNum(e.target.value) })} placeholder="Only if high" />
        </label>

        <fieldset className="profile-form-group profile-form-full">
          <legend>Weight (for rigging)</legend>
          <label className="field">
            <span className="field-label">Bare weight (kg)</span>
            <input type="number" min={0} step={0.1} value={d.weightKg ?? ''} onChange={(e) => setD({ ...d, weightKg: optNum(e.target.value) })} placeholder="From the datasheet" />
          </label>
          <label className="field">
            <span className="field-label">Clamp and safety (kg)</span>
            <input type="number" min={0} step={0.1} value={d.clampKg ?? ''} onChange={(e) => setD({ ...d, clampKg: optNum(e.target.value) })} placeholder="Rigging default" />
          </label>
        </fieldset>

        <fieldset className="profile-form-group profile-form-full">
          <legend>Power</legend>
          <label className="field">
            <span className="field-label">Power in</span>
            <select value={d.powerConnector} onChange={(e) => setD({ ...d, powerConnector: e.target.value as PowerConnector })}>
              {Object.entries(POWER_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Most per line on the thru</span>
            <input
              type="number"
              min={1}
              value={d.maxPerLine ?? ''}
              disabled={!d.hasPowerThru}
              onChange={(e) => setD({ ...d, maxPerLine: optNum(e.target.value) })}
              placeholder={d.hasPowerThru ? "Maker's figure" : 'No thru'}
            />
          </label>
          <label className="check-field profile-form-full">
            <input type="checkbox" checked={d.hasPowerThru} onChange={(e) => setD({ ...d, hasPowerThru: e.target.checked })} />
            <span>Has a power thru (power out to the next fixture)</span>
          </label>
        </fieldset>

        <fieldset className="profile-form-group profile-form-full">
          <legend>Data</legend>
          <label className="field">
            <span className="field-label">Data in</span>
            <select value={d.dataConnector} onChange={(e) => setD({ ...d, dataConnector: e.target.value as DataConnector })}>
              {Object.entries(DATA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="check-field check-field-inline">
            <input type="checkbox" checked={d.hasDataThru} onChange={(e) => setD({ ...d, hasDataThru: e.target.checked })} />
            <span>RJ45 data in and out</span>
          </label>
        </fieldset>

        <label className="field profile-form-full">
          <span className="field-label">Also called</span>
          <input value={d.aliases ?? ''} onChange={(e) => setD({ ...d, aliases: e.target.value || null })} placeholder="Other names the patch uses, comma separated" />
        </label>
        <label className="field profile-form-full">
          <span className="field-label">Notes</span>
          <input value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} />
        </label>
        {error && <p className="error profile-form-full">{error}</p>}
        <div className="modal-actions profile-form-full">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
