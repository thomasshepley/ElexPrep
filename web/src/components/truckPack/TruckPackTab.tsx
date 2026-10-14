import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { PACK_CATEGORIES, PACK_CATEGORY_LABEL, planTruckPack, type PackCategory, type PlacedStack, type VehiclePack } from '@elexprep/shared';
import { api, type JobTruckPack, type ManualCase } from '../../api/client';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useToast } from '../Toast';
import { SkeletonPanel } from '../Skeleton';
import { formatDateTime } from '../../utils/format';
import { IsoView, Legend, PlanView, SideView, kg, metres, stackLabel, stackWhere } from './TruckViews';

type View = 'plan' | 'side' | '3d' | 'steps';
const VIEW_KEY = 'elex-truck-view';
const VIEWS: { v: View; label: string }[] = [
  { v: 'plan', label: 'Plan' },
  { v: 'side', label: 'Side' },
  { v: '3d', label: '3D' },
  { v: 'steps', label: 'Load order' },
];

function readView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.v === v) ? (v as View) : null;
  } catch {
    return null;
  }
}

/**
 * Truck pack (alpha), webmaster only: how the job's kit packs into a van or truck, the smallest
 * one it fits, and the order to load it. Cases come from the case rules and the fixture database
 * until stock is itemised by container in Current RMS.
 */
export default function TruckPackTab({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { showToast } = useToast();
  const phone = useIsPhone();
  const [data, setData] = useState<JobTruckPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setViewState] = useState<View>(() => (phone ? 'steps' : readView() ?? 'plan'));
  const [packIndex, setPackIndex] = useState(0);
  const [step, setStep] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.truckPack
      .job(jobId)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [jobId]);
  useEffect(load, [load]);

  const setView = (v: View) => {
    setViewState(v);
    if (phone) return;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not remembered; fine.
    }
  };

  const save = async (patch: Parameters<typeof api.truckPack.save>[1]) => {
    setSaving(true);
    try {
      setData(await api.truckPack.save(jobId, patch));
      setStep(null);
      setSelected(null);
      setPackIndex(0);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const result = useMemo(() => (data ? planTruckPack(data.manifest.lines, data.cases, data.vehicles, data.settings, { vehicleId: data.vehicleId }) : null), [data]);

  if (error) return <p className="error">Could not work out the truck pack: {error}</p>;
  if (!data || !result) return <SkeletonPanel height={420} />;

  const vehicleById = new Map(data.vehicles.map((v) => [v.id, v]));
  const caseById = new Map(data.cases.map((c) => [c.id, c]));
  const pack: VehiclePack | null = result.packs[Math.min(packIndex, result.packs.length - 1)] ?? null;
  const vehicle = pack ? vehicleById.get(pack.vehicleId)! : null;
  const total = pack?.stacks.length ?? 0;
  const shownStep = step === null ? total : Math.min(step, total);
  const sel = pack?.stacks.find((s) => s.id === selected) ?? null;
  const smallest = result.smallestId ? vehicleById.get(result.smallestId) : null;
  const unplaced = result.packs.flatMap((p) => p.unplaced);

  const printNow = () => {
    document.body.classList.add('print-truck');
    const done = () => {
      document.body.classList.remove('print-truck');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  };

  return (
    <div className="tp-tab">
      <p className="tp-banner" role="note">
        <strong>Alpha, webmaster only.</strong> An estimate of how the kit packs, from the case rules, the fixture database and typical case and vehicle sizes. Check
        it on the dock: until stock is itemised by container, case counts are worked out, not counted.
      </p>

      <div className="tp-toolbar">
        <label className="field tp-source">
          <span className="field-label">Kit from</span>
          <select value={data.requestedSource} onChange={(e) => save({ source: e.target.value as JobTruckPack['requestedSource'] })} disabled={saving}>
            <option value="AUTO">{data.linked ? 'The Current RMS kit list (linked)' : 'The patch (not linked to Current RMS)'}</option>
            <option value="PICKLIST">The Current RMS kit list</option>
            <option value="PATCH">The patch and the cable plan</option>
          </select>
        </label>
        <div className="tabs tabs-sub tp-views" role="tablist" aria-label="View">
          {VIEWS.map((x) => (
            <button key={x.v} type="button" role="tab" aria-selected={view === x.v} className={view === x.v ? 'active' : ''} onClick={() => setView(x.v)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="row-actions">
          <a className="button secondary" href={api.truckPack.csvUrl(jobId, data.vehicleId)} download>
            Load order CSV
          </a>
          <button type="button" className="secondary" onClick={printNow} disabled={!pack}>
            Print
          </button>
        </div>
      </div>
      {data.sourceNote && (
        <p className="tp-note" role="status">
          {data.sourceNote}
        </p>
      )}

      <div className="tp-summary">
        <div>
          <span className="tp-summary-n">{result.totals.cases}</span>
          <span className="muted">cases</span>
        </div>
        <div>
          <span className="tp-summary-n">{kg(result.totals.kg)}</span>
          <span className="muted">all in</span>
        </div>
        <div>
          <span className="tp-summary-n">{result.totals.volumeM3} m³</span>
          <span className="muted">of cases</span>
        </div>
        <div className={smallest ? 'is-ok' : 'is-warning'}>
          <span className="tp-summary-n">{smallest ? smallest.name : result.split ? `${result.packs.length} vehicles` : 'Nothing fits'}</span>
          <span className="muted">{smallest ? 'smallest it all fits in' : result.split ? 'needed: no one vehicle takes it all' : 'check the case sizes'}</span>
        </div>
        {pack && vehicle && (
          <div>
            <span className="tp-summary-n">
              {metres(pack.usedLengthMm)} of {metres(vehicle.lengthMm)}
            </span>
            <span className="muted">floor used in the {result.packs.length > 1 ? `vehicle ${packIndex + 1}` : 'vehicle shown'}</span>
          </div>
        )}
      </div>

      <section className="panel tp-vehicles" aria-label="Vehicles">
        <div className="panel-heading-row">
          <h2>Vehicles</h2>
          {data.vehicleId && (
            <button type="button" className="secondary" onClick={() => save({ vehicleId: null })} disabled={saving}>
              Show the smallest that fits
            </button>
          )}
        </div>
        <div className="tp-vehicle-list" role="radiogroup" aria-label="Vehicle to show">
          {result.checks.map((c) => {
            const v = vehicleById.get(c.vehicleId)!;
            const shown = result.packs.some((p) => p.vehicleId === v.id) && (data.vehicleId === v.id || (!data.vehicleId && result.smallestId === v.id));
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={shown}
                className={`tp-vehicle${shown ? ' is-shown' : ''}${c.fits ? ' is-fits' : ' is-nofit'}`}
                onClick={() => save({ vehicleId: v.id })}
                disabled={saving}
              >
                <span className="tp-vehicle-name">{v.name}</span>
                <span className="tp-vehicle-size muted">
                  {metres(v.lengthMm)} x {metres(v.widthMm)} x {metres(v.heightMm)}, {kg(v.payloadKg)}
                </span>
                <span className={`tp-fit ${c.fits ? 'is-ok' : 'is-no'}`}>
                  {c.fits ? `Fits, ${metres(c.usedLengthMm)} of floor` : c.reason ?? 'Does not fit'}
                  {result.smallestId === v.id ? ' · smallest' : ''}
                </span>
              </button>
            );
          })}
        </div>
        {result.split && !data.vehicleId && (
          <div className="tabs tabs-sub tp-pack-tabs" role="tablist" aria-label="Vehicle">
            {result.packs.map((p, i) => (
              <button key={i} type="button" role="tab" aria-selected={packIndex === i} className={packIndex === i ? 'active' : ''} onClick={() => (setPackIndex(i), setStep(null), setSelected(null))}>
                {i + 1}: {p.vehicleName} ({p.cases} cases)
              </button>
            ))}
          </div>
        )}
      </section>

      {!pack || !vehicle ? (
        <section className="panel">
          <p>{data.manifest.lines.length ? 'None of the vehicles take any of these cases: check the case sizes in the truck pack settings.' : 'Nothing to pack yet: the kit list or patch has nothing with a case.'}</p>
        </section>
      ) : (
        <div className={`tp-layout${view === 'steps' ? ' is-wide' : ''}`}>
          <section className="panel tp-main">
            {view !== 'steps' && (
              <>
                {view === 'plan' && <PlanView pack={pack} vehicle={vehicle} step={shownStep} selectedId={selected} onSelect={setSelected} />}
                {view === 'side' && <SideView pack={pack} vehicle={vehicle} step={shownStep} selectedId={selected} onSelect={setSelected} />}
                {view === '3d' && <IsoView pack={pack} vehicle={vehicle} step={shownStep} selectedId={selected} onSelect={setSelected} />}
                <Stepper total={total} step={shownStep} onStep={(n) => (setStep(n >= total ? null : n), setSelected(pack.stacks.find((s) => s.step === n)?.id ?? null))} current={pack.stacks.find((s) => s.step === shownStep) ?? null} vehicle={vehicle} />
              </>
            )}
            {view === 'steps' && <Steps pack={pack} vehicle={vehicle} selectedId={selected} onSelect={setSelected} />}
          </section>
          {view !== 'steps' && (
            <aside className="tp-inspector" aria-label="Selected">
              {sel ? (
                <StackCard s={sel} vehicle={vehicle} />
              ) : (
                <div className="panel tp-hint">
                  <h3>Stacks</h3>
                  <p className="muted">Pick a stack for what's in it and where it goes, or step through the load to see the order it goes in.</p>
                  <Legend />
                </div>
              )}
              <WeightPanel pack={pack} vehicle={vehicle} />
            </aside>
          )}
        </div>
      )}

      {unplaced.length > 0 && (
        <section className="panel tp-unplaced">
          <h2>Not packed</h2>
          <ul>
            {unplaced.map((u, i) => (
              <li key={i}>
                <strong>
                  {u.count} x {u.label}
                </strong>
                : {u.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Manifest data={data} saving={saving} onSave={save} caseName={(id) => caseById.get(id)?.name ?? 'Unknown case'} onRuleSaved={load} />

      {data.manifest.trunks.length > 0 && (
        <section className="panel">
          <h2>Cable trunks</h2>
          <p className="muted">
            Cable is weighed and measured into {caseById.get(data.settings.trunkCaseId ?? '')?.name ?? 'trunks'}: up to {data.settings.trunkMaxKg} kg of cable each, with coils
            taking about {Math.round(data.settings.trunkFill * 100)}% of a trunk's {data.settings.trunkLitres} litres. Socapex, power, data and motor cable travel apart.
          </p>
          <div className="table-scroll">
            <table className="tp-trunk-table">
              <thead>
                <tr>
                  <th>Trunk</th>
                  <th className="num">Cable</th>
                  <th className="num">Weight</th>
                  <th className="num">Space</th>
                  <th className="num">Trunks</th>
                  <th>Decided by</th>
                  <th>What's in them</th>
                </tr>
              </thead>
              <tbody>
                {data.manifest.trunks.map((t) => (
                  <tr key={t.group}>
                    <td>{t.label}</td>
                    <td className="num">{[t.metres ? `${t.metres} m` : '', t.pieces ? `${t.pieces} pcs` : ''].filter(Boolean).join(', ')}</td>
                    <td className="num">{kg(t.cableKg)}</td>
                    <td className="num">{t.litres} L</td>
                    <td className="num">
                      <strong>{t.trunks}</strong>
                    </td>
                    <td>{t.limitedBy === 'weight' ? 'Weight' : 'Space'}</td>
                    <td className="muted">{t.lines.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Assumptions</h2>
        <ul className="tp-assumptions">
          {data.manifest.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          <li>
            Loaded from the cab back. What's needed first at the venue goes in last, by the doors: {data.settings.unloadOrder.map((c) => PACK_CATEGORY_LABEL[c]).join(', then ')}.
          </li>
          <li>
            Cases of the same kind stack up to their own limit and under the roof (less {data.settings.clearanceMm} mm), heaviest at the bottom.
            {data.settings.mixedStacking ? ' A lighter, smaller case may top up a stack of the same group.' : ''}
          </li>
          <li>Case and vehicle sizes are typical figures: measure your own cases and check each vehicle's plate. Wheel arches are kept clear.</li>
          <li>
            Fixtures use their case rule (units per case) and the case set for them; other kit uses the item rules. All in <Link to="/settings/truck-pack">the truck pack settings</Link>{' '}
            and <Link to="/settings/fixture-types">Case Rules</Link>.
          </li>
        </ul>
        {data.updatedAt && (
          <p className="muted">
            Last changed by {data.updatedBy ?? 'someone'}, {formatDateTime(data.updatedAt)}.
          </p>
        )}
      </section>

      {pack && vehicle && createPortal(<PrintView jobName={jobName} packs={result.packs} vehicles={vehicleById} data={data} />, document.body)}
    </div>
  );
}

function Stepper({ total, step, onStep, current, vehicle }: { total: number; step: number; onStep: (n: number) => void; current: PlacedStack | null; vehicle: JobTruckPack['vehicles'][number] }) {
  return (
    <div className="tp-stepper">
      <div className="tp-stepper-controls">
        <button type="button" className="secondary" onClick={() => onStep(Math.max(0, step - 1))} disabled={step <= 0} aria-label="One step back">
          Back
        </button>
        <input type="range" min={0} max={total} value={step} onChange={(e) => onStep(Number(e.target.value))} aria-label="Loading step" />
        <button type="button" className="secondary" onClick={() => onStep(Math.min(total, step + 1))} disabled={step >= total} aria-label="One step on">
          Next
        </button>
      </div>
      <p className="tp-stepper-text" aria-live="polite">
        {step >= total ? (
          <>All {total} stacks loaded. Step through to see the order they go in.</>
        ) : step === 0 ? (
          <>Empty. Next goes in first, against the cab.</>
        ) : current ? (
          <>
            <strong>
              Step {step} of {total}:
            </strong>{' '}
            {stackLabel(current)}, {stackWhere(current, vehicle)}.
          </>
        ) : null}
      </p>
    </div>
  );
}

function StackCard({ s, vehicle }: { s: PlacedStack; vehicle: JobTruckPack['vehicles'][number] }) {
  return (
    <article className={`panel tp-card tp-cat-${s.category.toLowerCase()}`}>
      <header className="tp-card-head">
        <span className="tp-step">{s.step}</span>
        <div>
          <strong>{stackLabel(s)}</strong>
          <div className="muted">{stackWhere(s, vehicle)}</div>
        </div>
      </header>
      <dl className="tp-facts">
        <div>
          <dt>Weight</dt>
          <dd>{kg(s.kg)}</dd>
        </div>
        <div>
          <dt>Height</dt>
          <dd>{metres(s.heightMm)}</dd>
        </div>
        <div>
          <dt>Footprint</dt>
          <dd>
            {metres(s.lengthMm)} x {metres(s.widthMm)}
            {s.rotated ? ', turned' : ''}
          </dd>
        </div>
        <div>
          <dt>Group</dt>
          <dd>{PACK_CATEGORY_LABEL[s.category]}</dd>
        </div>
      </dl>
      <ol className="tp-stack-cases" reversed>
        {[...s.cases].reverse().map((c, i) => (
          <li key={i}>
            {c.label} <span className="muted">({c.caseName}, {kg(c.kg)})</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function WeightPanel({ pack, vehicle }: { pack: VehiclePack; vehicle: JobTruckPack['vehicles'][number] }) {
  const pct = Math.min(100, (pack.kg / pack.payloadKg) * 100);
  return (
    <div className="panel tp-weight">
      <h3>Weight</h3>
      <div className={`tp-payload${pack.kg > pack.payloadKg ? ' is-over' : pct > 90 ? ' is-near' : ''}`}>
        <div className="tp-payload-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p>
          <strong>{kg(pack.kg)}</strong> of the {kg(pack.payloadKg)} payload ({Math.round((pack.kg / pack.payloadKg) * 100)}%)
        </p>
      </div>
      {pack.cog && (
        <p className="muted">
          Centre of the weight: {Math.round(pack.cog.xPct)}% of the way back from the cab, {Math.abs(Math.round(pack.cog.yPct - 50))}%{' '}
          {pack.cog.yPct < 50 ? 'left' : pack.cog.yPct > 50 ? 'right' : ''} of the middle. Marked with a cross on the plan.
        </p>
      )}
      <p className="muted">
        {pack.cases} cases in {pack.stacks.length} stacks, filling {pack.fillPct}% of the {vehicle.name.toLowerCase()}'s space.
      </p>
      {pack.flags.map((f) => (
        <p key={f} className="tp-flag">
          {f}
        </p>
      ))}
    </div>
  );
}

function Steps({ pack, vehicle, selectedId, onSelect }: { pack: VehiclePack; vehicle: JobTruckPack['vehicles'][number]; selectedId: string | null; onSelect: (id: string) => void }) {
  const groups: { cat: PackCategory; stacks: PlacedStack[] }[] = [];
  for (const s of pack.stacks) {
    const last = groups[groups.length - 1];
    if (last && last.cat === s.category) last.stacks.push(s);
    else groups.push({ cat: s.category, stacks: [s] });
  }
  return (
    <div className="tp-steps">
      <p className="muted">
        Load in this order, from the cab back to the doors: {kg(pack.kg)} in {pack.stacks.length} stacks, {metres(pack.usedLengthMm)} of floor.
      </p>
      {groups.map((g, gi) => (
        <section key={gi} className="tp-step-group">
          <h3>
            <span className={`tp-swatch tp-cat-${g.cat.toLowerCase()}`} aria-hidden="true" /> {PACK_CATEGORY_LABEL[g.cat]}
          </h3>
          <ol className="tp-step-list">
            {g.stacks.map((s) => (
              <li key={s.id}>
                <button type="button" className={`tp-step-card tp-cat-${s.category.toLowerCase()}${s.id === selectedId ? ' is-selected' : ''}`} onClick={() => onSelect(s.id)}>
                  <span className="tp-step">{s.step}</span>
                  <span className="tp-step-body">
                    <strong>{stackLabel(s)}</strong>
                    <span className="muted">
                      {stackWhere(s, vehicle)} · {kg(s.kg)} · {metres(s.heightMm)} high
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Manifest({
  data,
  saving,
  onSave,
  caseName,
  onRuleSaved,
}: {
  data: JobTruckPack;
  saving: boolean;
  onSave: (patch: { overrides?: Record<string, number>; manual?: ManualCase[] }) => void;
  caseName: (id: string) => string;
  onRuleSaved: () => void;
}) {
  const { showToast } = useToast();
  const m = data.manifest;
  const totalKg = m.lines.reduce((n, l) => n + l.cases * l.kgEach, 0);
  const setOverride = (key: string, v: number | null) => {
    const next = { ...data.overrides };
    if (v === null) delete next[key];
    else next[key] = v;
    onSave({ overrides: next });
  };
  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Cases</h2>
        <span className="muted">
          {m.lines.reduce((n, l) => n + l.cases, 0)} cases, {kg(totalKg)}, from {data.kitLines} {data.source === 'PICKLIST' ? 'kit list lines' : 'fixture types'}
        </span>
      </div>
      <div className="table-scroll">
        <table className="tp-manifest">
          <thead>
            <tr>
              <th>Kit</th>
              <th>Case</th>
              <th className="num">Cases</th>
              <th className="num">Each</th>
              <th className="num">Total</th>
              <th>Group</th>
              <th>Contents</th>
            </tr>
          </thead>
          <tbody>
            {m.lines.map((l) => (
              <tr key={l.key}>
                <td>{l.label}</td>
                <td>{caseName(l.caseId)}</td>
                <td className="num">
                  <input
                    className="cable-num"
                    type="number"
                    min={0}
                    defaultValue={l.cases}
                    key={`${l.key}:${l.cases}`}
                    aria-label={`${l.label} cases`}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== l.cases) setOverride(l.key, v);
                    }}
                    disabled={saving}
                  />
                  {data.overrides[l.key] !== undefined && (
                    <button type="button" className="link-button tp-reset" onClick={() => setOverride(l.key, null)}>
                      Reset
                    </button>
                  )}
                </td>
                <td className="num">{kg(l.kgEach)}</td>
                <td className="num">{kg(l.kgEach * l.cases)}</td>
                <td>
                  <span className={`tp-chip tp-cat-${l.category.toLowerCase()}`}>{PACK_CATEGORY_LABEL[l.category]}</span>
                </td>
                <td className="muted">
                  {l.contents}
                  {l.source === 'MANUAL' && (
                    <>
                      {' '}
                      <button type="button" className="link-button" onClick={() => onSave({ manual: data.manual.filter((x) => x.key !== l.key) })}>
                        Remove
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {m.unknown.length > 0 && (
        <div className="tp-unknown">
          <h3>Kit with no case yet</h3>
          <p className="muted">These aren't on the truck. Say what each travels in and it's remembered for every job (as an item rule), or mark it as not packed.</p>
          <ul>
            {m.unknown.map((u) => (
              <UnknownRow
                key={u.name}
                u={u}
                cases={data.cases}
                onSaved={() => {
                  showToast('Saved for every job', 'success');
                  onRuleSaved();
                }}
              />
            ))}
          </ul>
        </div>
      )}
      {m.ignored.length > 0 && (
        <details className="tp-ignored">
          <summary>
            {m.ignored.length} kit list line{m.ignored.length === 1 ? '' : 's'} not packed (labour, services and similar)
          </summary>
          <p className="muted">{m.ignored.map((i) => `${i.quantity} x ${i.name}`).join(', ')}</p>
        </details>
      )}
      <AddCase cases={data.cases} onAdd={(c) => onSave({ manual: [...data.manual, c] })} disabled={saving} />
    </section>
  );
}

function UnknownRow({ u, cases, onSaved }: { u: { name: string; quantity: number; reason: string }; cases: JobTruckPack['cases']; onSaved: () => void }) {
  const { showToast } = useToast();
  const [caseId, setCaseId] = useState('');
  const [units, setUnits] = useState('1');
  const [itemKg, setItemKg] = useState('');
  const [busy, setBusy] = useState(false);
  const saveRule = async (ignore: boolean) => {
    setBusy(true);
    try {
      await api.truckPack.saveRule({ match: u.name, caseId: ignore ? null : caseId, unitsPerCase: Math.max(1, Number(units) || 1), itemKg: Number(itemKg) || 0, ignore, category: null });
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="tp-unknown-row">
      <div>
        <strong>
          {u.quantity} x {u.name}
        </strong>
        <div className="muted">{u.reason}</div>
      </div>
      <div className="tp-unknown-form">
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label={`Case for ${u.name}`}>
          <option value="">Travels in…</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="cable-num" type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Per case" title="Per case" />
        <input className="cable-num" type="number" min={0} step={0.1} value={itemKg} onChange={(e) => setItemKg(e.target.value)} placeholder="kg each" aria-label="Weight of one" />
        <button type="button" onClick={() => saveRule(false)} disabled={busy || !caseId}>
          Save
        </button>
        <button type="button" className="secondary" onClick={() => saveRule(true)} disabled={busy}>
          Not packed
        </button>
      </div>
    </li>
  );
}

function AddCase({ cases, onAdd, disabled }: { cases: JobTruckPack['cases']; onAdd: (c: ManualCase) => void; disabled: boolean }) {
  const [caseId, setCaseId] = useState('');
  const [count, setCount] = useState('1');
  const [label, setLabel] = useState('');
  const [kgEach, setKgEach] = useState('');
  return (
    <form
      className="tp-add-case"
      onSubmit={(e) => {
        e.preventDefault();
        if (!caseId) return;
        onAdd({ key: `manual:${Date.now().toString(36)}`, caseId, label: label.trim(), cases: Math.max(1, Number(count) || 1), kgEach: kgEach === '' ? null : Number(kgEach) });
        setCaseId('');
        setCount('1');
        setLabel('');
        setKgEach('');
      }}
    >
      <label className="field">
        <span className="field-label">Add cases by hand</span>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">Choose a case…</option>
          {PACK_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={PACK_CATEGORY_LABEL[cat]}>
              {cases
                .filter((c) => c.category === cat)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">How many</span>
        <input className="cable-num" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">What's in it</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Spares, consumables…" maxLength={120} />
      </label>
      <label className="field">
        <span className="field-label">Each, packed (kg)</span>
        <input className="cable-num" type="number" min={0} value={kgEach} onChange={(e) => setKgEach(e.target.value)} placeholder="Empty weight" />
      </label>
      <button type="submit" className="secondary" disabled={disabled || !caseId}>
        Add
      </button>
    </form>
  );
}

/** What Print prints: each vehicle from above and the side, the load order, and the cases. */
function PrintView({ jobName, packs, vehicles, data }: { jobName: string; packs: VehiclePack[]; vehicles: Map<string, JobTruckPack['vehicles'][number]>; data: JobTruckPack }) {
  return (
    <div className="tp-print" aria-hidden="true">
      <h1>{jobName}: truck pack</h1>
      <p>
        <strong>Alpha estimate.</strong> Worked out from the case rules and typical case and vehicle sizes; check on the dock. Printed {formatDateTime(new Date())}.
      </p>
      {packs.map((p, i) => {
        const v = vehicles.get(p.vehicleId)!;
        return (
          <div key={i} className="tp-print-vehicle">
            <h2>
              {packs.length > 1 ? `Vehicle ${i + 1}: ` : ''}
              {v.name}: {kg(p.kg)} of {kg(p.payloadKg)}, {metres(p.usedLengthMm)} of {metres(v.lengthMm)}
            </h2>
            <PlanView pack={p} vehicle={v} step={p.stacks.length} selectedId={null} onSelect={() => {}} />
            <SideView pack={p} vehicle={v} step={p.stacks.length} selectedId={null} onSelect={() => {}} />
            <ol className="tp-print-steps">
              {p.stacks.map((s) => (
                <li key={s.id}>
                  {stackLabel(s)}: {stackWhere(s, v)}, {kg(s.kg)}
                </li>
              ))}
            </ol>
            {p.unplaced.length > 0 && <p>Not packed: {p.unplaced.map((u) => `${u.count} x ${u.label} (${u.reason})`).join('; ')}</p>}
          </div>
        );
      })}
      <h2>Cases</h2>
      <table>
        <thead>
          <tr>
            <th>Kit</th>
            <th>Cases</th>
            <th>Each</th>
            <th>Contents</th>
          </tr>
        </thead>
        <tbody>
          {data.manifest.lines.map((l) => (
            <tr key={l.key}>
              <td>{l.label}</td>
              <td>{l.cases}</td>
              <td>{kg(l.kgEach)}</td>
              <td>{l.contents}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
