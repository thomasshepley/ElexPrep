import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type HoistModel, type RiggingSettings, type TrussProfile } from '../api/client';
import { useDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SkeletonPanel } from '../components/Skeleton';

type NumKey = 'marginPct' | 'warnAtPct' | 'overAtPct' | 'riggingAllowanceKg' | 'clampKg' | 'socaKgPerM' | 'dmxKgPerM' | 'catKgPerM' | 'connectorPct';

const NUMBERS: { key: NumKey; label: string; help?: string; step?: number }[] = [
  { key: 'marginPct', label: 'Safety margin on every point (%)', help: 'Added on top of the static load. Loads are always static; no dynamic factor.' },
  { key: 'warnAtPct', label: 'Warning from (% of capacity)' },
  { key: 'overAtPct', label: 'Over capacity from (% of capacity)' },
  { key: 'riggingAllowanceKg', label: 'Rigging allowance per point (kg)', help: 'Sling, shackle and motor control cable.', step: 0.5 },
  { key: 'clampKg', label: 'Clamp and safety per fixture (kg)', help: 'When the fixture record has none.', step: 0.1 },
  { key: 'socaKgPerM', label: 'Socapex weight (kg per m)', step: 0.01 },
  { key: 'dmxKgPerM', label: 'DMX weight (kg per m)', step: 0.01 },
  { key: 'catKgPerM', label: 'Cat weight (kg per m)', step: 0.01 },
  { key: 'connectorPct', label: 'Connectors and fan-outs on the cable (%)' },
];

/** Settings > Rigging (admin): the rigging calculator's margin and thresholds, default truss and hoist, and the truss and hoist lists. */
export default function RiggingSettingsPage() {
  const { showToast } = useToast();
  const dialog = useDialog();
  const [settings, setSettings] = useState<RiggingSettings | null>(null);
  const [trusses, setTrusses] = useState<TrussProfile[]>([]);
  const [hoists, setHoists] = useState<HoistModel[]>([]);
  const [editTruss, setEditTruss] = useState<{ id: string | null; data: Omit<TrussProfile, 'id'> } | null>(null);
  const [editHoist, setEditHoist] = useState<{ id: string | null; data: Omit<HoistModel, 'id'> } | null>(null);

  const load = () =>
    api.rigging
      .config()
      .then((c) => {
        setSettings(c.settings);
        setTrusses(c.trussProfiles);
        setHoists(c.hoistModels);
      })
      .catch((e) => showToast((e as Error).message, 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return <SkeletonPanel lines={8} />;

  const save = async (patch: Partial<RiggingSettings>) => {
    try {
      setSettings(await api.rigging.saveSettings(patch));
      showToast('Saved', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <div>
      <h1>Rigging</h1>
      <p className="muted">
        For the Rigging (beta) tab on each job, which only admins can see for now. Fixture weights are in <Link to="/settings/fixtures">the fixture database</Link>.
        Figures noted as unverified must be checked against the maker's own sheet.
      </p>

      <section className="panel">
        <h2>Calculation</h2>
        <div className="form-grid settings-grid">
          <label className="field">
            <span className="field-label">Method for trusses on 3 or more hoists</span>
            <select value={settings.method} onChange={(e) => save({ method: e.target.value as RiggingSettings['method'] })}>
              <option value="envelope">Envelope (recommended)</option>
              <option value="tributary">Tributary</option>
              <option value="continuous">Continuous beam</option>
            </select>
            <span className="field-help">Envelope takes the larger of tributary (each span on its own) and continuous beam (all hoists level).</span>
          </label>
          <label className="field">
            <span className="field-label">Default truss</span>
            <select value={settings.defaultTrussProfileId ?? ''} onChange={(e) => save({ defaultTrussProfileId: e.target.value || null })}>
              {trusses.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Default hoist</span>
            <select value={settings.defaultHoistModelId ?? ''} onChange={(e) => save({ defaultHoistModelId: e.target.value || null })}>
              {hoists.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          {NUMBERS.map((n) => (
            <label key={n.key} className="field">
              <span className="field-label">{n.label}</span>
              <input
                type="number"
                step={n.step ?? 1}
                min={0}
                defaultValue={settings[n.key]}
                key={`${n.key}:${settings[n.key]}`}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== settings[n.key]) void save({ [n.key]: v } as Partial<RiggingSettings>);
                }}
              />
              {n.help && <span className="field-help">{n.help}</span>}
            </label>
          ))}
          <label className="check-field check-field-inline" style={{ gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={settings.trussFactor085} onChange={(e) => save({ trussFactor085: e.target.checked })} />
            <span>0.85 factor on the truss span check (BS 7905-2 / ANSI E1.2-2006)</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Trusses</h2>
          <button type="button" onClick={() => setEditTruss({ id: null, data: { name: '', maker: null, kgPerM: 0, spanTable: [], cantileverRatio: 0.25, source: null, notes: null } })}>
            Add truss
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Truss</th>
                <th className="num">kg per m</th>
                <th>Allowable load by span</th>
                <th>Cantilever limit</th>
                <th>Notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {trusses.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {settings.defaultTrussProfileId === t.id && <span className="chip chip-accent"> Default</span>}
                  </td>
                  <td className="num">{t.kgPerM}</td>
                  <td>{t.spanTable.length ? t.spanTable.map((r) => `${r.spanM} m: ${r.udlKgPerM} kg/m`).join(', ') : <span className="muted">None</span>}</td>
                  <td>{Math.round(t.cantileverRatio * 100)}% of the span</td>
                  <td className="muted">{t.notes}</td>
                  <td className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditTruss({ id: t.id, data: { ...t } })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        if (!(await dialog.confirm({ title: `Delete ${t.name}?`, confirmLabel: 'Delete', danger: true }))) return;
                        await api.rigging.deleteTruss(t.id).catch((e) => showToast((e as Error).message, 'error'));
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
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Hoists</h2>
          <button type="button" onClick={() => setEditHoist({ id: null, data: { name: '', ratedKg: 500, hoistClass: 'D8+', bodyKg: 0, chainKgPerM: 0, chainM: 20, notes: null } })}>
            Add hoist
          </button>
        </div>
        <p className="muted">Each point's load includes its hoist's body and its full chain (the conservative figure), hanging from the venue point.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hoist</th>
                <th className="num">Rated load</th>
                <th>Class</th>
                <th className="num">Body</th>
                <th className="num">Chain</th>
                <th>Notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {hoists.map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.name}</strong>
                    {settings.defaultHoistModelId === h.id && <span className="chip chip-accent"> Default</span>}
                  </td>
                  <td className="num">{h.ratedKg} kg</td>
                  <td>{h.hoistClass}</td>
                  <td className="num">{h.bodyKg} kg</td>
                  <td className="num">
                    {h.chainM} m at {h.chainKgPerM} kg/m
                  </td>
                  <td className="muted">{h.notes}</td>
                  <td className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditHoist({ id: h.id, data: { ...h } })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        if (!(await dialog.confirm({ title: `Delete ${h.name}?`, confirmLabel: 'Delete', danger: true }))) return;
                        await api.rigging.deleteHoist(h.id).catch((e) => showToast((e as Error).message, 'error'));
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
      </section>

      {editTruss && (
        <TrussForm
          initial={editTruss.data}
          title={editTruss.id ? `Edit ${editTruss.data.name}` : 'Add a truss'}
          onClose={() => setEditTruss(null)}
          onSave={async (d) => {
            if (editTruss.id) await api.rigging.updateTruss(editTruss.id, d);
            else await api.rigging.createTruss(d);
            setEditTruss(null);
            void load();
          }}
        />
      )}
      {editHoist && (
        <HoistForm
          initial={editHoist.data}
          title={editHoist.id ? `Edit ${editHoist.data.name}` : 'Add a hoist'}
          onClose={() => setEditHoist(null)}
          onSave={async (d) => {
            if (editHoist.id) await api.rigging.updateHoist(editHoist.id, d);
            else await api.rigging.createHoist(d);
            setEditHoist(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function useSubmit<T>(onSave: (d: T) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (d: T) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

function TrussForm({ initial, title, onClose, onSave }: { initial: Omit<TrussProfile, 'id'>; title: string; onClose: () => void; onSave: (d: Omit<TrussProfile, 'id'>) => Promise<void> }) {
  const [d, setD] = useState(initial);
  const [table, setTable] = useState(initial.spanTable.map((r) => `${r.spanM}: ${r.udlKgPerM}`).join(', '));
  const { error, busy, submit } = useSubmit(onSave);
  const parseTable = () =>
    table
      .split(',')
      .map((p) => p.split(':').map((v) => Number(v.trim())))
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0)
      .map(([spanM, udlKgPerM]) => ({ spanM, udlKgPerM }));
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ ...d, spanTable: parseTable() });
        }}
      >
        <label className="field profile-form-full">
          <span className="field-label">Name</span>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Maker</span>
          <input value={d.maker ?? ''} onChange={(e) => setD({ ...d, maker: e.target.value || null })} />
        </label>
        <label className="field">
          <span className="field-label">Weight (kg per m)</span>
          <input type="number" step={0.01} min={0} value={d.kgPerM} onChange={(e) => setD({ ...d, kgPerM: Number(e.target.value) })} required />
        </label>
        <label className="field profile-form-full">
          <span className="field-label">Allowable distributed load by span (span m: kg per m, comma separated)</span>
          <input value={table} onChange={(e) => setTable(e.target.value)} placeholder="6: 322, 8: 194, 10: 122" />
          <span className="field-help">From the maker's single-span table, which already allows for the truss's own weight.</span>
        </label>
        <label className="field">
          <span className="field-label">Longest cantilever (share of the span)</span>
          <input type="number" step={0.01} min={0} max={1} value={d.cantileverRatio} onChange={(e) => setD({ ...d, cantileverRatio: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span className="field-label">Source</span>
          <input value={d.source ?? ''} onChange={(e) => setD({ ...d, source: e.target.value || null })} placeholder="Maker's load table" />
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

function HoistForm({ initial, title, onClose, onSave }: { initial: Omit<HoistModel, 'id'>; title: string; onClose: () => void; onSave: (d: Omit<HoistModel, 'id'>) => Promise<void> }) {
  const [d, setD] = useState(initial);
  const { error, busy, submit } = useSubmit(onSave);
  const num = (k: keyof Omit<HoistModel, 'id'>) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) });
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(d);
        }}
      >
        <label className="field profile-form-full">
          <span className="field-label">Name</span>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Rated load (kg)</span>
          <input type="number" min={1} value={d.ratedKg} onChange={num('ratedKg')} required />
        </label>
        <label className="field">
          <span className="field-label">Class</span>
          <select value={d.hoistClass} onChange={(e) => setD({ ...d, hoistClass: e.target.value })}>
            <option value="D8">D8</option>
            <option value="D8+">D8+</option>
            <option value="C1">C1</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Body (kg)</span>
          <input type="number" step={0.1} min={0} value={d.bodyKg} onChange={num('bodyKg')} required />
        </label>
        <label className="field">
          <span className="field-label">Chain (kg per m)</span>
          <input type="number" step={0.01} min={0} value={d.chainKgPerM} onChange={num('chainKgPerM')} required />
        </label>
        <label className="field">
          <span className="field-label">Chain in the bag (m)</span>
          <input type="number" step={1} min={0} value={d.chainM} onChange={num('chainM')} required />
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
