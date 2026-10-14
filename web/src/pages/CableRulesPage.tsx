import { useEffect, useState } from 'react';
import type { CableRules, DataConnector, PowerConnector } from '@elexprep/shared';
import { api, type FixtureProfile, type FixtureProfileInput } from '../api/client';
import { useDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { SkeletonPanel, SkeletonTableRows } from '../components/Skeleton';

const POWER_LABEL: Record<PowerConnector, string> = { CEE16: '16A', TRUE1: 'TRUE1', POWERCON: 'powerCON', OTHER: 'Other' };
const DATA_LABEL: Record<DataConnector, string> = { DMX5: '5-pin DMX', DMX3: '3-pin DMX', ETHERCON: 'RJ45 / etherCON' };

type NumberKey = {
  [K in keyof CableRules]: CableRules[K] extends number ? K : never;
}[keyof CableRules];
type ListKey = {
  [K in keyof CableRules]: CableRules[K] extends number[] ? K : never;
}[keyof CableRules];

const NUMBERS: { key: NumberKey; label: string; help?: string; step?: number }[] = [
  { key: 'circuitAmps', label: 'Circuit rating (A)' },
  { key: 'voltage', label: 'Supply voltage (V)' },
  { key: 'utilisation', label: 'Use up to this share of a circuit', help: '0.8 means 80 percent. A company choice, not a BS 7671 rule.', step: 0.05 },
  { key: 'circuitsPerSoca', label: 'Circuits per Soca' },
  { key: 'spareCircuitsPerPosition', label: 'Spare circuits per position' },
  { key: 'defaultTrimM', label: 'Default trim (m)', step: 0.5 },
  { key: 'defaultDistanceM', label: 'Default run to dimmer city (m)' },
  { key: 'swagPct', label: 'Swag on the drop (%)' },
  { key: 'floorSlackM', label: 'Floor slack (m)' },
  { key: 'distroTailM', label: 'Tail at the distro (m)' },
  { key: 'trussReachM', label: 'Reach along a truss before an extension (m)', help: 'How far past its cable pick a Soca can land without an extension.' },
  { key: 'jumperSlackM', label: 'Slack on jumpers (m)', step: 0.5 },
  { key: 'maxDmxDevicesPerLine', label: 'Most fixtures on one DMX line', help: 'Under the 32 unit-load limit.' },
  { key: 'nodePorts', label: 'Ports on a truss node' },
];

const LISTS: { key: ListKey; label: string }[] = [
  { key: 'socaLengthsM', label: 'Soca lengths' },
  { key: 'dmxLengthsM', label: '5-pin DMX lengths' },
  { key: 'catLengthsM', label: 'Cat lengths' },
  { key: 'jumperLengthsM', label: 'Jumper lengths' },
];

/** Settings > Cable rules (admin): the company cable rules and the fixture database the cable calculator uses. */
export default function CableRulesPage() {
  return (
    <div>
      <h1>Cable rules</h1>
      <p className="muted">Used by the Cable (beta) tab on each job. Lengths are what the company carries, in metres.</p>
      <RulesPanel />
      <ProfilesPanel />
    </div>
  );
}

function RulesPanel() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<CableRules | null>(null);
  const [defaults, setDefaults] = useState<CableRules | null>(null);
  const [lists, setLists] = useState<Record<string, string>>({});

  const apply = (r: CableRules) => {
    setRules(r);
    setLists(Object.fromEntries(LISTS.map((l) => [l.key, r[l.key].join(', ')]).concat([['motorCableLengthsM', r.motorCableLengthsM.join(', ')]])));
  };
  useEffect(() => {
    api.cable
      .rules()
      .then((r) => {
        apply(r.rules);
        setDefaults(r.defaults);
      })
      .catch((e) => showToast((e as Error).message, 'error'));
  }, [showToast]);

  if (!rules || !defaults) return <SkeletonPanel lines={8} />;

  const save = async (patch: Partial<CableRules>) => {
    try {
      apply((await api.cable.saveRules(patch)).rules);
      showToast('Saved', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };
  const parseList = (s: string) => s.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);

  return (
    <section className="panel">
      <h2>Rules</h2>
      <div className="cable-rules-grid">
        <fieldset className="radio-stack">
          <legend>
            <strong>Data</strong>
          </legend>
          <label className="radio-row">
            <input type="radio" name="dataPolicy" checked={rules.dataPolicy === 'DMX_FROM_DISTRO'} onChange={() => save({ dataPolicy: 'DMX_FROM_DISTRO' })} />
            <span>
              DMX from the distro <span className="field-help">One 5-pin line per universe, run in the loom from dimmer city.</span>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="dataPolicy" checked={rules.dataPolicy === 'NODE_PER_TRUSS'} onChange={() => save({ dataPolicy: 'NODE_PER_TRUSS' })} />
            <span>
              A node on each truss <span className="field-help">One Cat run to a node, DMX tails from its ports.</span>
            </span>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={rules.spareDmxLinePerPosition} onChange={(e) => save({ spareDmxLinePerPosition: e.target.checked })} />
            Add a spare DMX line to each position
          </label>
        </fieldset>
        <div className="radio-stack">
          <label>
            Dimmer city
            <select value={rules.distroSide} onChange={(e) => save({ distroSide: e.target.value as CableRules['distroSide'] })}>
              <option value="SR">Stage right</option>
              <option value="SL">Stage left</option>
              <option value="US">Upstage</option>
              <option value="DS">Downstage</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={rules.allowChainWhenThru} onChange={(e) => save({ allowChainWhenThru: e.target.checked })} />
            Chain fixtures with a power thru on one circuit
          </label>
          <span className="field-help">Off: always one fixture per 16A circuit. On: fixtures with a thru share a circuit up to their maker's per-line figure.</span>
        </div>
      </div>
      <div className="form-grid">
        {NUMBERS.map((n) => (
          <label key={n.key}>
            {n.label}
            <input
              type="number"
              step={n.step ?? 1}
              defaultValue={rules[n.key]}
              key={`${n.key}:${rules[n.key]}`}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v !== rules[n.key]) void save({ [n.key]: v } as Partial<CableRules>);
              }}
            />
            {n.help && <span className="field-help">{n.help}</span>}
          </label>
        ))}
        {LISTS.map((l) => (
          <label key={l.key}>
            {l.label} (m)
            <input
              value={lists[l.key] ?? ''}
              onChange={(e) => setLists({ ...lists, [l.key]: e.target.value })}
              onBlur={() => void save({ [l.key]: parseList(lists[l.key] ?? '') } as Partial<CableRules>)}
              placeholder={defaults[l.key].join(', ')}
            />
          </label>
        ))}
      </div>
      <h3>Rigging</h3>
      <p className="muted">Motors are a rigging pack: the calculator lists them separately from the lighting cables so they are never pulled together by mistake.</p>
      <div className="form-grid">
        <label className="checkbox-row">
          <input type="checkbox" checked={rules.motorsEnabled} onChange={(e) => save({ motorsEnabled: e.target.checked })} />
          Include motor cables and controllers
        </label>
        <label>
          Ways per motor controller
          <input
            type="number"
            defaultValue={rules.motorWaysPerController}
            key={`mw:${rules.motorWaysPerController}`}
            onBlur={(e) => Number(e.target.value) !== rules.motorWaysPerController && save({ motorWaysPerController: Number(e.target.value) })}
          />
        </label>
        <label>
          Motor cable lengths (m)
          <input
            value={lists.motorCableLengthsM ?? ''}
            onChange={(e) => setLists({ ...lists, motorCableLengthsM: e.target.value })}
            onBlur={() => void save({ motorCableLengthsM: parseList(lists.motorCableLengthsM ?? '') })}
          />
        </label>
      </div>
      <button type="button" className="secondary" onClick={() => save(defaults)}>
        Back to the standard rules
      </button>
    </section>
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
        <h2>Fixture database</h2>
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
              <th>Power</th>
              <th>Data</th>
              <th>Notes</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!profiles && <SkeletonTableRows rows={6} cols={6} />}
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.displayName}</strong>
                  {p.aliases && <div className="muted">Also called {p.aliases}</div>}
                </td>
                <td className="num">{p.watts}</td>
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
        <div className="form-grid">
          <label>
            Name
            <input value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} required />
          </label>
          <label>
            Maximum watts at 230 V
            <input type="number" min={0} value={d.watts} onChange={(e) => setD({ ...d, watts: Number(e.target.value) })} required />
          </label>
          <label>
            Power in
            <select value={d.powerConnector} onChange={(e) => setD({ ...d, powerConnector: e.target.value as PowerConnector })}>
              {Object.entries(POWER_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={d.hasPowerThru} onChange={(e) => setD({ ...d, hasPowerThru: e.target.checked })} />
            Has a power thru
          </label>
          <label>
            Most per line on the thru
            <input type="number" min={1} value={d.maxPerLine ?? ''} onChange={(e) => setD({ ...d, maxPerLine: optNum(e.target.value) })} placeholder="Maker's figure" />
          </label>
          <label>
            Data
            <select value={d.dataConnector} onChange={(e) => setD({ ...d, dataConnector: e.target.value as DataConnector })}>
              {Object.entries(DATA_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={d.hasDataThru} onChange={(e) => setD({ ...d, hasDataThru: e.target.checked })} />
            RJ45 data in and out
          </label>
          <label>
            Inrush (A)
            <input type="number" min={0} step={0.1} value={d.inrushA ?? ''} onChange={(e) => setD({ ...d, inrushA: optNum(e.target.value) })} placeholder="Only if high" />
          </label>
          <label className="form-grid-full">
            Also called (comma separated)
            <input value={d.aliases ?? ''} onChange={(e) => setD({ ...d, aliases: e.target.value || null })} placeholder="Names the patch uses" />
          </label>
          <label className="form-grid-full">
            Notes
            <input value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
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
