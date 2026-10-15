import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CableRules } from '@elexprep/shared';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { SkeletonPanel } from '../components/Skeleton';


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

/** Settings > Cable rules (admin): the company cable rules the cable calculator uses. */
export default function CableRulesPage() {
  return (
    <div>
      <h1>Cable rules</h1>
      <p className="muted">Used by the Cable (beta) tab on each job. Lengths are what the company carries, in metres.</p>
      <RulesPanel />
      <p className="muted">
        Fixture power, connectors and weights are in <Link to="/settings/fixtures">the fixture database</Link>, shared with the rigging calculator.
      </p>
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
          <label className="check-field">
            <input type="checkbox" checked={rules.spareDmxLinePerPosition} onChange={(e) => save({ spareDmxLinePerPosition: e.target.checked })} />
            <span>Add a spare DMX line to each position</span>
          </label>
        </fieldset>
        <div className="radio-stack">
          <label className="field">
            <span className="field-label">Dimmer city</span>
            <select value={rules.distroSide} onChange={(e) => save({ distroSide: e.target.value as CableRules['distroSide'] })}>
              <option value="SR">Stage right</option>
              <option value="SL">Stage left</option>
              <option value="US">Upstage</option>
              <option value="DS">Downstage</option>
            </select>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={rules.allowChainWhenThru} onChange={(e) => save({ allowChainWhenThru: e.target.checked })} />
            <span>Chain fixtures with a power thru on one circuit</span>
          </label>
          <span className="field-help">Off: always one fixture per 16A circuit. On: fixtures with a thru share a circuit up to their maker's per-line figure.</span>
        </div>
      </div>
      <div className="form-grid settings-grid">
        {NUMBERS.map((n) => (
          <label key={n.key} className="field">
            <span className="field-label">{n.label}</span>
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
          <label key={l.key} className="field">
            <span className="field-label">{l.label} (m)</span>
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
      <div className="form-grid settings-grid">
        <label className="check-field check-field-inline">
          <input type="checkbox" checked={rules.motorsEnabled} onChange={(e) => save({ motorsEnabled: e.target.checked })} />
          <span>Include motor cables and controllers</span>
        </label>
        <label className="field">
          <span className="field-label">Ways per motor controller</span>
          <input
            type="number"
            defaultValue={rules.motorWaysPerController}
            key={`mw:${rules.motorWaysPerController}`}
            onBlur={(e) => Number(e.target.value) !== rules.motorWaysPerController && save({ motorWaysPerController: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field-label">Motor cable lengths (m)</span>
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

