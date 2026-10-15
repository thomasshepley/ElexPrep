import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PACK_CATEGORIES, PACK_CATEGORY_LABEL, type CableKind } from '@elexprep/shared';
import { api, type PackCategory, type TruckCase, type TruckItemRule, type TruckPackSettings, type TruckVehicle } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SkeletonPanel } from '../components/Skeleton';

type Config = Awaited<ReturnType<typeof api.truckPack.config>>;

const m = (mm: number | null) => (mm == null ? '-' : `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`);

/** Settings > Truck pack (webmaster, alpha): packing rules, cable trunks, vehicles, the case library, fixture cases and item rules. */
export default function TruckPackSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const dialog = useDialog();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [editCase, setEditCase] = useState<{ id: string | null; data: Omit<TruckCase, 'id'> } | null>(null);
  const [editVehicle, setEditVehicle] = useState<{ id: string | null; data: Omit<TruckVehicle, 'id'> } | null>(null);
  const [editRule, setEditRule] = useState<{ id: string | null; data: Omit<TruckItemRule, 'id'> } | null>(null);

  const load = () =>
    api.truckPack
      .config()
      .then(setCfg)
      .catch((e) => showToast((e as Error).message, 'error'));
  useEffect(() => {
    if (user?.role === 'WEBMASTER') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (user && user.role !== 'WEBMASTER') return <Navigate to="/settings" replace />;
  if (!cfg) return <SkeletonPanel lines={8} />;
  const s = cfg.settings;
  const caseName = new Map(cfg.cases.map((c) => [c.id, c.name]));

  const save = async (patch: Partial<TruckPackSettings>) => {
    try {
      const settings = await api.truckPack.saveSettings(patch);
      setCfg((c) => c && { ...c, settings });
      showToast('Saved', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };
  const numField = (key: 'clearanceMm' | 'maxSideOffsetPct' | 'maxRearCogPct' | 'trunkLitres' | 'trunkMaxKg' | 'trunkFill' | 'defaultCableLengthM', label: string, step = 1, help?: string) => (
    <label key={key} className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        defaultValue={s[key]}
        key={`${key}:${s[key]}`}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== s[key]) void save({ [key]: v } as Partial<TruckPackSettings>);
        }}
      />
      {help && <span className="field-help">{help}</span>}
    </label>
  );
  const move = (i: number, d: -1 | 1) => {
    const order = [...s.unloadOrder];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void save({ unloadOrder: order });
  };
  const remove = async (what: string, fn: () => Promise<void>) => {
    if (!(await dialog.confirm({ title: `Delete ${what}?`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await fn();
      void load();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <div>
      <h1>Truck pack</h1>
      <p className="muted">
        Alpha, only the webmaster sees this and the Truck pack tab. Sizes are typical figures to start from: measure your own cases and check each vehicle's plate.
      </p>

      <section className="panel">
        <h2>Packing</h2>
        <div className="form-grid settings-grid">
          {numField('clearanceMm', 'Kept free under the roof (mm)', 10)}
          {numField('maxSideOffsetPct', 'Flag weight off-centre by more than (% of width)')}
          {numField('maxRearCogPct', 'Flag weight further back than (% of length)')}
          <label className="check-field check-field-inline" style={{ gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={s.mixedStacking} onChange={(e) => save({ mixedStacking: e.target.checked })} />
            <span>Let a lighter, smaller case top up a stack of the same group</span>
          </label>
        </div>
        <h3>Order kit is needed at the venue</h3>
        <p className="muted">First needed goes in last, by the doors. Everything else is loaded from the cab back in the reverse of this order.</p>
        <ol className="tp-order">
          {s.unloadOrder.map((c, i) => (
            <li key={c}>
              <span className={`tp-swatch tp-cat-${c.toLowerCase()}`} aria-hidden="true" />
              <span className="tp-order-name">{PACK_CATEGORY_LABEL[c]}</span>
              <button type="button" className="secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${PACK_CATEGORY_LABEL[c]} earlier`}>
                Up
              </button>
              <button type="button" className="secondary" onClick={() => move(i, 1)} disabled={i === s.unloadOrder.length - 1} aria-label={`Move ${PACK_CATEGORY_LABEL[c]} later`}>
                Down
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Cable trunks</h2>
        <p className="muted">Cable is weighed and measured into trunks: whichever of weight or space runs out first decides how many.</p>
        <div className="form-grid settings-grid">
          <label className="field">
            <span className="field-label">Trunk case</span>
            <select value={s.trunkCaseId ?? ''} onChange={(e) => save({ trunkCaseId: e.target.value || null })}>
              <option value="">None (cable not packed)</option>
              {cfg.cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {numField('trunkLitres', 'Space inside one trunk (litres)', 10, 'A 1200 x 600 x 600 mm trunk holds about 360 litres.')}
          {numField('trunkMaxKg', 'Most cable in one trunk (kg)', 5)}
          {numField('trunkFill', 'Share of the space coils fill (0 to 1)', 0.05, 'Coils leave gaps: about a third is typical.')}
          {numField('defaultCableLengthM', 'Length for cable with none in its name (m)')}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cable</th>
                <th>Trunk</th>
                <th className="num">kg per m</th>
                <th className="num">Diameter (mm)</th>
                <th className="num">Each (kg / litres)</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(s.cableSpecs) as CableKind[]).map((k) => {
                const c = s.cableSpecs[k];
                const set = (patch: Partial<typeof c>) => save({ cableSpecs: { ...s.cableSpecs, [k]: { ...c, ...patch } } });
                const cell = (field: 'kgPerM' | 'diameterMm' | 'kgEach' | 'litresEach', step: number) => (
                  <input
                    className="cable-num"
                    type="number"
                    step={step}
                    min={0}
                    defaultValue={c[field] ?? 0}
                    key={`${k}:${field}:${c[field]}`}
                    aria-label={`${c.label} ${field}`}
                    onBlur={(e) => Number(e.target.value) !== c[field] && set({ [field]: Number(e.target.value) })}
                  />
                );
                return (
                  <tr key={k}>
                    <td>{c.label}</td>
                    <td className="muted">{c.group === 'SOCA' ? 'Socapex' : c.group === 'POWER' ? 'Power' : c.group === 'DATA' ? 'Data' : 'Motor cable'}</td>
                    <td className="num">{c.kgEach === undefined ? cell('kgPerM', 0.01) : '-'}</td>
                    <td className="num">{c.kgEach === undefined ? cell('diameterMm', 0.5) : '-'}</td>
                    <td className="num">
                      {c.kgEach !== undefined ? (
                        <>
                          {cell('kgEach', 0.1)} {cell('litresEach', 0.5)}
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Vehicles</h2>
          <button
            type="button"
            onClick={() =>
              setEditVehicle({
                id: null,
                data: {
                  name: '',
                  lengthMm: 4000,
                  widthMm: 2000,
                  heightMm: 2100,
                  payloadKg: 1000,
                  doorWidthMm: null,
                  doorHeightMm: null,
                  archFromMm: null,
                  archToMm: null,
                  archClearWidthMm: null,
                  trailerLengthMm: null,
                  trailerWidthMm: null,
                  trailerHeightMm: null,
                  licence: null,
                  notes: null,
                  enabled: true,
                },
              })
            }
          >
            Add vehicle
          </button>
        </div>
        <p className="muted">
          Inside load space. The truck pack tries each one, smallest first, and shows the smallest the whole load fits in. A drawbar's trailer is a second load space under the
          same payload. Vehicles marked not used are kept but never tried.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th className="num">Load space (L x W x H)</th>
                <th className="num">Payload</th>
                <th>Doors</th>
                <th>Arches</th>
                <th>Licence</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {cfg.vehicles.map((v) => (
                <tr key={v.id} className={v.enabled ? '' : 'is-muted'}>
                  <td>
                    <strong>{v.name}</strong>
                    {!v.enabled && <span className="muted"> (not used)</span>}
                    {v.notes && <div className="muted">{v.notes}</div>}
                  </td>
                  <td className="num">
                    {m(v.lengthMm)} x {m(v.widthMm)} x {m(v.heightMm)}
                    {v.trailerLengthMm != null && (
                      <div className="muted">
                        Trailer {m(v.trailerLengthMm)} x {m(v.trailerWidthMm)} x {m(v.trailerHeightMm)}
                      </div>
                    )}
                  </td>
                  <td className="num">{v.payloadKg.toLocaleString('en-GB')} kg</td>
                  <td>{v.doorWidthMm || v.doorHeightMm ? `${m(v.doorWidthMm)} x ${m(v.doorHeightMm)}` : <span className="muted">Full size</span>}</td>
                  <td>{v.archFromMm != null ? `${m(v.archClearWidthMm)} between` : <span className="muted">None</span>}</td>
                  <td>{v.licence}</td>
                  <td className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditVehicle({ id: v.id, data: { ...v } })}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(v.name, () => api.truckPack.deleteVehicle(v.id))}>
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
          <h2>Case library</h2>
          <button
            type="button"
            onClick={() =>
              setEditCase({ id: null, data: { name: '', lengthMm: 1200, widthMm: 600, heightMm: 800, emptyKg: 30, maxStack: 2, canGoOnTop: true, canRotate: true, category: 'OTHER', holds: 1, notes: null } })
            }
          >
            Add case
          </button>
        </div>
        <p className="muted">Outside sizes, castors and lid included. Stack limit is the most that stand in one stack, itself included; the roof usually decides first.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Group</th>
                <th className="num">L x W x H</th>
                <th className="num">Empty</th>
                <th className="num">Stack</th>
                <th className="num">Holds</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {cfg.cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.notes && <div className="muted">{c.notes}</div>}
                  </td>
                  <td>
                    <span className={`tp-chip tp-cat-${c.category.toLowerCase()}`}>{PACK_CATEGORY_LABEL[c.category]}</span>
                  </td>
                  <td className="num">
                    {c.lengthMm} x {c.widthMm} x {c.heightMm} mm
                  </td>
                  <td className="num">{c.emptyKg} kg</td>
                  <td className="num">
                    {c.maxStack === 1 ? 'Never' : `${c.maxStack} high`}
                    {!c.canGoOnTop && c.maxStack > 1 ? ', own kind only' : ''}
                  </td>
                  <td className="num">{c.holds}</td>
                  <td className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditCase({ id: c.id, data: { ...c } })}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(c.name, () => api.truckPack.deleteCase(c.id))}>
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
        <h2>Fixtures</h2>
        <p className="muted">
          The case each fixture in the fixture database travels in. How many go in a case comes from Case Rules, then from what the case holds.
        </p>
        <div className="table-scroll">
          <table className="tp-fixture-cases">
            <thead>
              <tr>
                <th>Fixture</th>
                <th className="num">Weight</th>
                <th>Travels in</th>
              </tr>
            </thead>
            <tbody>
              {cfg.fixtures.map((f) => (
                <tr key={f.id}>
                  <td>{f.displayName}</td>
                  <td className="num">{f.weightKg == null ? <span className="muted">Not set</span> : `${f.weightKg} kg`}</td>
                  <td>
                    <select
                      value={f.truckCaseId ?? ''}
                      aria-label={`Case for ${f.displayName}`}
                      onChange={async (e) => {
                        try {
                          const r = await api.truckPack.setFixtureCase(f.id, e.target.value || null);
                          setCfg((c) => c && { ...c, fixtures: c.fixtures.map((x) => (x.id === f.id ? { ...x, truckCaseId: r.truckCaseId } : x)) });
                        } catch (err) {
                          showToast((err as Error).message, 'error');
                        }
                      }}
                    >
                      <option value="">Not set</option>
                      {cfg.cases
                        .filter((c) => c.category === 'FIXTURES')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Item rules</h2>
          <button type="button" onClick={() => setEditRule({ id: null, data: { match: '', caseId: null, unitsPerCase: 1, itemKg: 0, ignore: false, category: null } })}>
            Add rule
          </button>
        </div>
        <p className="muted">For kit-list lines that aren't fixtures or cable. Every word must be in the line's name; the most specific rule wins.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Words</th>
                <th>Packed in</th>
                <th className="num">Per case</th>
                <th className="num">Each</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {cfg.itemRules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.match}</code>
                  </td>
                  <td>{r.ignore ? <span className="muted">Not packed</span> : caseName.get(r.caseId ?? '') ?? <span className="error">Case deleted</span>}</td>
                  <td className="num">{r.ignore ? '' : r.unitsPerCase}</td>
                  <td className="num">{r.ignore ? '' : `${r.itemKg} kg`}</td>
                  <td className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditRule({ id: r.id, data: { ...r } })}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(`the rule for "${r.match}"`, () => api.truckPack.deleteRule(r.id))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editCase && (
        <CaseForm
          initial={editCase.data}
          title={editCase.id ? `Edit ${editCase.data.name}` : 'Add a case'}
          onClose={() => setEditCase(null)}
          onSave={async (d) => {
            if (editCase.id) await api.truckPack.updateCase(editCase.id, d);
            else await api.truckPack.createCase(d);
            setEditCase(null);
            void load();
          }}
        />
      )}
      {editVehicle && (
        <VehicleForm
          initial={editVehicle.data}
          title={editVehicle.id ? `Edit ${editVehicle.data.name}` : 'Add a vehicle'}
          onClose={() => setEditVehicle(null)}
          onSave={async (d) => {
            if (editVehicle.id) await api.truckPack.updateVehicle(editVehicle.id, d);
            else await api.truckPack.createVehicle(d);
            setEditVehicle(null);
            void load();
          }}
        />
      )}
      {editRule && (
        <RuleForm
          initial={editRule.data}
          cases={cfg.cases}
          title={editRule.id ? 'Edit the rule' : 'Add an item rule'}
          onClose={() => setEditRule(null)}
          onSave={async (d) => {
            if (editRule.id) await api.truckPack.updateRule(editRule.id, d);
            else await api.truckPack.saveRule(d);
            setEditRule(null);
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

function FormActions({ busy, error, onClose }: { busy: boolean; error: string | null; onClose: () => void }) {
  return (
    <>
      {error && <p className="error profile-form-full">{error}</p>}
      <div className="modal-actions profile-form-full">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}

function CategorySelect({ value, onChange, allowNone }: { value: PackCategory | null; onChange: (c: PackCategory | null) => void; allowNone?: boolean }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as PackCategory | null)}>
      {allowNone && <option value="">The case's own group</option>}
      {PACK_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {PACK_CATEGORY_LABEL[c]}
        </option>
      ))}
    </select>
  );
}

function CaseForm({ initial, title, onClose, onSave }: { initial: Omit<TruckCase, 'id'>; title: string; onClose: () => void; onSave: (d: Omit<TruckCase, 'id'>) => Promise<void> }) {
  const [d, setD] = useState(initial);
  const { error, busy, submit } = useSubmit(onSave);
  const n = (k: 'lengthMm' | 'widthMm' | 'heightMm' | 'emptyKg' | 'maxStack' | 'holds') => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) });
  return (
    <Modal title={title} onClose={onClose}>
      <form className="profile-form" onSubmit={(e) => (e.preventDefault(), void submit(d))}>
        <label className="field profile-form-full">
          <span className="field-label">Name</span>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Length (mm)</span>
          <input type="number" min={50} value={d.lengthMm} onChange={n('lengthMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Width (mm)</span>
          <input type="number" min={50} value={d.widthMm} onChange={n('widthMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Height, castors in (mm)</span>
          <input type="number" min={50} value={d.heightMm} onChange={n('heightMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Empty weight (kg)</span>
          <input type="number" min={0} step={0.1} value={d.emptyKg} onChange={n('emptyKg')} required />
        </label>
        <label className="field">
          <span className="field-label">Most in one stack (1 = never stacked)</span>
          <input type="number" min={1} max={10} value={d.maxStack} onChange={n('maxStack')} required />
        </label>
        <label className="field">
          <span className="field-label">Holds (units, when no case rule)</span>
          <input type="number" min={1} value={d.holds} onChange={n('holds')} required />
        </label>
        <label className="field">
          <span className="field-label">Group</span>
          <CategorySelect value={d.category} onChange={(c) => setD({ ...d, category: c ?? 'OTHER' })} />
        </label>
        <label className="check-field profile-form-full">
          <input type="checkbox" checked={d.canGoOnTop} onChange={(e) => setD({ ...d, canGoOnTop: e.target.checked })} />
          <span>May sit on top of a different case</span>
        </label>
        <label className="check-field profile-form-full">
          <input type="checkbox" checked={d.canRotate} onChange={(e) => setD({ ...d, canRotate: e.target.checked })} />
          <span>May be turned on the floor</span>
        </label>
        <label className="field profile-form-full">
          <span className="field-label">Notes</span>
          <input value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} />
        </label>
        <FormActions busy={busy} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}

function VehicleForm({ initial, title, onClose, onSave }: { initial: Omit<TruckVehicle, 'id'>; title: string; onClose: () => void; onSave: (d: Omit<TruckVehicle, 'id'>) => Promise<void> }) {
  const [d, setD] = useState(initial);
  const { error, busy, submit } = useSubmit(onSave);
  const n = (k: keyof Omit<TruckVehicle, 'id' | 'name' | 'licence' | 'notes' | 'enabled'>, optional = false) => ({
    value: d[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: optional && e.target.value === '' ? null : Number(e.target.value) }),
  });
  return (
    <Modal title={title} onClose={onClose}>
      <form className="profile-form" onSubmit={(e) => (e.preventDefault(), void submit(d))}>
        <label className="field profile-form-full">
          <span className="field-label">Name</span>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className="field">
          <span className="field-label">Load length (mm)</span>
          <input type="number" min={500} {...n('lengthMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Load width (mm)</span>
          <input type="number" min={500} {...n('widthMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Load height (mm)</span>
          <input type="number" min={500} {...n('heightMm')} required />
        </label>
        <label className="field">
          <span className="field-label">Payload (kg)</span>
          <input type="number" min={1} {...n('payloadKg')} required />
        </label>
        <label className="field">
          <span className="field-label">Door width (mm)</span>
          <input type="number" min={0} {...n('doorWidthMm', true)} placeholder="Full width" />
        </label>
        <label className="field">
          <span className="field-label">Door height (mm)</span>
          <input type="number" min={0} {...n('doorHeightMm', true)} placeholder="Full height" />
        </label>
        <fieldset className="profile-form-group profile-form-full">
          <legend>Wheel arches (vans)</legend>
          <label className="field">
            <span className="field-label">From (mm from the bulkhead)</span>
            <input type="number" min={0} {...n('archFromMm', true)} />
          </label>
          <label className="field">
            <span className="field-label">To (mm)</span>
            <input type="number" min={0} {...n('archToMm', true)} />
          </label>
          <label className="field">
            <span className="field-label">Clear between them (mm)</span>
            <input type="number" min={0} {...n('archClearWidthMm', true)} />
          </label>
        </fieldset>
        <fieldset className="profile-form-group profile-form-full">
          <legend>Drawbar trailer (leave blank for none)</legend>
          <label className="field">
            <span className="field-label">Trailer length (mm)</span>
            <input type="number" min={0} {...n('trailerLengthMm', true)} />
          </label>
          <label className="field">
            <span className="field-label">Trailer width (mm)</span>
            <input type="number" min={0} {...n('trailerWidthMm', true)} />
          </label>
          <label className="field">
            <span className="field-label">Trailer height (mm)</span>
            <input type="number" min={0} {...n('trailerHeightMm', true)} />
          </label>
        </fieldset>
        <label className="field">
          <span className="field-label">Licence</span>
          <input value={d.licence ?? ''} onChange={(e) => setD({ ...d, licence: e.target.value || null })} />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />
          <span>Try this vehicle when packing</span>
        </label>
        <label className="field profile-form-full">
          <span className="field-label">Notes</span>
          <input value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} />
        </label>
        <FormActions busy={busy} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}

function RuleForm({
  initial,
  cases,
  title,
  onClose,
  onSave,
}: {
  initial: Omit<TruckItemRule, 'id'>;
  cases: TruckCase[];
  title: string;
  onClose: () => void;
  onSave: (d: Omit<TruckItemRule, 'id'>) => Promise<void>;
}) {
  const [d, setD] = useState(initial);
  const { error, busy, submit } = useSubmit(onSave);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="profile-form" onSubmit={(e) => (e.preventDefault(), void submit(d))}>
        <label className="field profile-form-full">
          <span className="field-label">Words in the kit-list line</span>
          <input value={d.match} onChange={(e) => setD({ ...d, match: e.target.value })} required placeholder="f34 3m" />
          <span className="field-help">All of them must appear, in any order. "3.0m" and "3 m" both match "3m".</span>
        </label>
        <label className="check-field profile-form-full">
          <input type="checkbox" checked={d.ignore} onChange={(e) => setD({ ...d, ignore: e.target.checked })} />
          <span>Not packed (labour, services, consumables)</span>
        </label>
        {!d.ignore && (
          <>
            <label className="field profile-form-full">
              <span className="field-label">Travels in</span>
              <select value={d.caseId ?? ''} onChange={(e) => setD({ ...d, caseId: e.target.value || null })} required>
                <option value="">Choose a case…</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Per case</span>
              <input type="number" min={1} value={d.unitsPerCase} onChange={(e) => setD({ ...d, unitsPerCase: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span className="field-label">Weight of one (kg)</span>
              <input type="number" min={0} step={0.1} value={d.itemKg} onChange={(e) => setD({ ...d, itemKg: Number(e.target.value) })} />
            </label>
            <label className="field profile-form-full">
              <span className="field-label">Group</span>
              <CategorySelect value={d.category} onChange={(c) => setD({ ...d, category: c })} allowNone />
            </label>
          </>
        )}
        <FormActions busy={busy} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}
