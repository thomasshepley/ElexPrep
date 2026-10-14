import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PositionKind } from '@elexprep/shared';
import { api, type CablePlanResult, type JobCable, type JobPosition } from '../api/client';
import { useToast } from './Toast';
import { SkeletonPanel } from './Skeleton';
import { formatDateTime } from '../utils/format';

type PositionPlan = CablePlanResult['positions'][number];

const KINDS: { value: PositionKind; label: string }[] = [
  { value: 'TRUSS', label: 'Truss' },
  { value: 'FLOOR', label: 'Floor' },
  { value: 'FOH', label: 'FOH' },
  { value: 'OTHER', label: 'Other' },
];

const SOURCE_LABEL: Record<JobPosition['source'], string> = { PATCH: 'Patch', PLOT: 'Plot', EXPORT: 'Export', MANUAL: 'Typed in' };

const metres = (l: number[]) => l.map((n) => `${n} m`).join(' + ');

/**
 * Cable (beta), admin only: the job's hanging positions from the patch, their geometry (read from
 * the plot or typed in), and the cable list worked out from them by the company cable rules.
 * Every number carries the rule that produced it, and totals can be overridden by hand.
 */
export default function CableTab({ jobId }: { jobId: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState<JobCable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.cable
      .job(jobId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);
  useEffect(load, [load]);

  if (error) return <p className="error">Could not load the cable calculator: {error}</p>;
  if (!data) return <SkeletonPanel rows={5} cols={6} />;

  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) showToast(done, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(null);
      load();
    }
  };

  const savePosition = (p: JobPosition, patch: Partial<JobPosition>) =>
    api.cable
      .updatePosition(jobId, p.id, patch)
      .then(load)
      .catch((e) => showToast((e as Error).message, 'error'));

  const plan = data.plan;
  const positions = data.positions.filter((p) => p.inPatch || p.motors > 0);

  return (
    <div className="cable-tab">
      <p className="cable-beta">
        <strong>Beta.</strong> A prep aid that gets the pack most of the way there and shows its working. Check it before you pull. The rules are in{' '}
        <Link to="/settings/cable-rules">Settings, Cable rules</Link> and each fixture's power and connectors are in <Link to="/settings/fixtures">the fixture database</Link>.
      </p>

      <section className="panel">
        <h2>Inputs</h2>
        <ul className="cable-checklist">
          <li className={data.inputs.fixtureCount ? 'is-ok' : 'is-missing'}>
            <strong>Patch:</strong>{' '}
            {data.inputs.fixtureCount
              ? `${data.inputs.fixtureCount} fixtures on ${data.inputs.positionCount} positions`
              : 'No patch yet. Import one on the Prep tab; positions come from its Position column.'}
            {data.inputs.unplaced.length > 0 && <span className="muted"> · {data.inputs.unplaced.length} with no position (listed below)</span>}
          </li>
          <li className={data.inputs.unknownTypes.length ? 'is-missing' : 'is-ok'}>
            <strong>Fixture database:</strong>{' '}
            {data.inputs.unknownTypes.length ? (
              <>
                not listed yet: {data.inputs.unknownTypes.join(', ')}. <Link to="/settings/fixtures">Add them</Link> for their power and connectors.
              </>
            ) : (
              'every fixture type is known'
            )}
          </li>
          <li className={data.plot ? 'is-ok' : data.inputs.plots.length ? 'is-partial' : 'is-missing'}>
            <strong>Plot:</strong>{' '}
            {data.inputs.plots.length === 0 && 'no CAD plot on the job yet (upload one on the Plots tab, or put it in the job\'s OneDrive CAD folder). Truss sizes can be typed in below.'}
            {data.plot && (
              <div>
                Read by itself from {data.plot.sourceName}:{' '}
                {data.plot.geometry.trusses.length
                  ? data.plot.geometry.trusses
                      .map((t) => {
                        const motors = t.points.length;
                        return `${t.position} ${t.lengthM} m, ${motors} motor${motors === 1 ? '' : 's'}${t.pickOffsetM != null ? `, pick ${t.pickOffsetM} m off the end` : ''}`;
                      })
                      .join('; ')
                  : 'no trusses found'}
                .
                <ul className="cable-notes">
                  {data.plot.geometry.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.inputs.plots.length > 0 && (
              <div className="cable-plot-actions">
                <span className="muted">{data.plot ? 'Read again, replacing sizes typed in below:' : 'Read from:'}</span>
                {data.inputs.plots.map((p) => (
                  <button
                    key={`${p.source}:${p.ref}`}
                    type="button"
                    className="secondary cable-inline-button"
                    disabled={busy !== null}
                    onClick={() => run('plot', () => api.cable.readPlot(jobId, p.source, p.ref), 'Read the plot')}
                  >
                    {busy === 'plot' ? 'Reading…' : p.name}
                    {p.note && <span className="muted"> ({p.note})</span>}
                  </button>
                ))}
              </div>
            )}
          </li>
          <li className={data.inputs.kit.linked && !data.inputs.kit.error ? 'is-ok' : 'is-partial'}>
            <strong>Kit list:</strong>{' '}
            {!data.inputs.kit.linked
              ? 'not linked to Current RMS, so nothing to check the plan against.'
              : data.inputs.kit.error
                ? `could not be read (${data.inputs.kit.error}).`
                : `${data.inputs.kit.lines.length} cable and distro lines on the opportunity.`}
          </li>
        </ul>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Positions</h2>
          <button type="button" disabled={busy !== null || positions.length === 0} onClick={() => run('compute', () => api.cable.compute(jobId), 'Cables worked out')}>
            {busy === 'compute' ? 'Working out…' : plan ? 'Work out again' : 'Work out cables'}
          </button>
        </div>
        <p className="muted">
          Blank boxes use the rule defaults (trim {data.rules.defaultTrimM} m, {data.rules.defaultDistanceM} m to dimmer city, which is {data.rules.distroSide === 'SR' ? 'stage right' : data.rules.distroSide === 'SL' ? 'stage left' : data.rules.distroSide === 'US' ? 'upstage' : 'downstage'}). Pick offset is how far along the truss the cable pick is from its nearer end.
        </p>
        {positions.length === 0 ? (
          <p className="muted">No positions yet: the patch has no Position column values.</p>
        ) : (
          <div className="table-scroll">
            <table className="cable-positions">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Type</th>
                  <th>Fixtures</th>
                  <th>Length (m)</th>
                  <th>Trim (m)</th>
                  <th>To dimmer city (m)</th>
                  <th>Pick offset (m)</th>
                  <th>Motors (rigging)</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <select value={p.kind} onChange={(e) => savePosition(p, { kind: e.target.value as PositionKind })} aria-label={`${p.name} type`}>
                        {KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{p.fixtureCount}</td>
                    {(['lengthM', 'trimM', 'distanceM', 'pickOffsetM'] as const).map((k) => (
                      <td key={k}>
                        <NumberCell
                          value={p[k]}
                          disabled={k === 'trimM' && p.kind !== 'TRUSS'}
                          placeholder={k === 'trimM' ? String(data.rules.defaultTrimM) : k === 'distanceM' ? String(data.rules.defaultDistanceM) : ''}
                          label={`${p.name} ${k}`}
                          onSave={(v) => savePosition(p, { [k]: v })}
                        />
                      </td>
                    ))}
                    <td>
                      <NumberCell value={p.motors || null} integer placeholder="0" label={`${p.name} motors`} onSave={(v) => savePosition(p, { motors: v ?? 0 })} />
                    </td>
                    <td className="muted">{SOURCE_LABEL[p.source]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {plan && (
        <>
          {plan.stale && (
            <p className="cable-stale" role="status">
              The patch, positions or rules have changed since this plan was worked out on {formatDateTime(plan.computedAt)}. Work it out again to update it; your
              overrides are kept.
            </p>
          )}
          <Totals jobId={jobId} plan={plan} kit={data.inputs.kit.lines} onChange={load} />
          <section className="cable-cards">
            {plan.result.positions.map((p) => (
              <PositionCard key={p.name} p={p} />
            ))}
          </section>
          {plan.result.unplaced.length > 0 && (
            <section className="panel">
              <h2>No position</h2>
              <p className="muted">These fixtures have no Position in the patch, so they are not in the plan: {plan.result.unplaced.join(', ')}.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NumberCell({
  value,
  onSave,
  placeholder,
  label,
  integer,
  disabled,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  placeholder?: string;
  label: string;
  integer?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => setText(value == null ? '' : String(value)), [value]);
  return (
    <input
      className="cable-num"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        const v = t === '' ? null : integer ? Math.round(Number(t)) : Number(t);
        if (v !== null && !Number.isFinite(v)) return setText(value == null ? '' : String(value));
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Totals({ jobId, plan, kit, onChange }: { jobId: string; plan: NonNullable<JobCable['plan']>; kit: { name: string; quantity: number }[]; onChange: () => void }) {
  const { showToast } = useToast();
  const lighting = plan.result.totals.filter((t) => t.section === 'LIGHTING');
  const rigging = plan.result.totals.filter((t) => t.section === 'RIGGING');
  const qty = (key: string, calc: number) => plan.overrides[key] ?? calc;

  const asText = () =>
    [
      'Lighting',
      ...lighting.map((t) => `${qty(t.key, t.quantity)} x ${t.label}`),
      ...(rigging.length ? ['', 'Rigging', ...rigging.map((t) => `${qty(t.key, t.quantity)} x ${t.label}`)] : []),
    ].join('\n');

  const setOverride = (key: string, calc: number, raw: string) => {
    const t = raw.trim();
    const v = t === '' ? null : Math.round(Number(t));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    api.cable
      .setOverride(jobId, key, v === calc ? null : v)
      .then(onChange)
      .catch((e) => showToast((e as Error).message, 'error'));
  };

  const rows = (list: typeof lighting) =>
    list.map((t) => (
      <tr key={t.key} className={plan.overrides[t.key] !== undefined ? 'is-overridden' : ''}>
        <td>{t.label}</td>
        <td className="num">{t.quantity}</td>
        <td>
          <input
            className="cable-num"
            inputMode="numeric"
            defaultValue={qty(t.key, t.quantity)}
            key={`${t.key}:${qty(t.key, t.quantity)}`}
            aria-label={`${t.label} quantity`}
            onBlur={(e) => setOverride(t.key, t.quantity, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {plan.overrides[t.key] !== undefined && (
            <button type="button" className="link-button" onClick={() => setOverride(t.key, t.quantity, String(t.quantity))}>
              Reset
            </button>
          )}
        </td>
      </tr>
    ));

  const d = plan.result.distro;
  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Cable list</h2>
        <div className="row-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(asText())
                .then(() => showToast('Copied', 'success'))
                .catch(() => showToast('Could not copy', 'error'))
            }
          >
            Copy as text
          </button>
          <a className="button secondary" href={api.cable.csvUrl(jobId)} download>
            Download CSV
          </a>
        </div>
      </div>
      <p className="muted">
        Worked out {formatDateTime(plan.computedAt)}. Change a quantity to override it; overrides stay when the plan is worked out again.
      </p>
      <div className="cable-totals-grid">
        <div className="table-scroll">
          <table className="cable-totals">
            <thead>
              <tr>
                <th>Lighting</th>
                <th className="num">Worked out</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>{rows(lighting)}</tbody>
          </table>
          {rigging.length > 0 && (
            <table className="cable-totals cable-rigging">
              <thead>
                <tr>
                  <th>Rigging (motors, a separate pack)</th>
                  <th className="num">Worked out</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>{rows(rigging)}</tbody>
            </table>
          )}
        </div>
        <div>
          <h3>Dimmer city</h3>
          <p>
            {d.socaOuts} Soca outs, {d.circuits} circuits, {d.amps} A in total.
            <br />
            <span className="muted">
              Per phase: L1 {d.ampsPerPhase[0]} A, L2 {d.ampsPerPhase[1]} A, L3 {d.ampsPerPhase[2]} A. {d.why}.
            </span>
          </p>
          {kit.length > 0 && (
            <>
              <h3>On the Current RMS kit list</h3>
              <ul className="cable-kit">
                {kit.map((k, i) => (
                  <li key={i}>
                    {k.quantity} x {k.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.result.flags.length > 0 && (
            <>
              <h3>Check these</h3>
              <ul className="cable-flags">
                {plan.result.flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Why({ children }: { children: string }) {
  return <span className="cable-why">{children}</span>;
}

function PositionCard({ p }: { p: PositionPlan }) {
  return (
    <article className="panel cable-card">
      <header className="cable-card-head">
        <h2>{p.name}</h2>
        <span className="muted">
          {p.fixtureCount} fixtures · {p.watts.toLocaleString()} W · {p.amps} A
        </span>
      </header>
      {p.fixtureCount > 0 && (
        <dl className="cable-facts">
          <div>
            <dt>Circuits</dt>
            <dd>
              {p.circuits.value}
              <Why>{p.circuits.why}</Why>
            </dd>
          </div>
          <div>
            <dt>Socas</dt>
            <dd>
              {p.socaCount.value} × {metres(p.socaLengthM.value)}
              <Why>{p.socaCount.why}</Why>
            </dd>
          </div>
          <div>
            <dt>Loom run</dt>
            <dd>
              {p.loomRunM.value} m<Why>{p.loomRunM.why}</Why>
            </dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>
              {p.data.policy === 'CAT_CHAIN'
                ? `Cat ${metres(p.data.catLengthM ?? [])}, chained`
                : `${p.data.lines.length} DMX ${p.data.lines.length === 1 ? 'line' : 'lines'}${p.data.node ? `, ${p.data.node.value} node, Cat ${metres(p.data.catLengthM ?? [])}` : ''}`}
              <Why>{p.data.why}</Why>
            </dd>
          </div>
        </dl>
      )}
      {p.socas.length > 0 && (
        <table className="cable-socas">
          <thead>
            <tr>
              <th>Soca</th>
              <th>Spider</th>
              <th>Circuits</th>
              <th>Load</th>
              <th>Extension</th>
              <th>Fixtures</th>
            </tr>
          </thead>
          <tbody>
            {p.socas.map((s) => (
              <tr key={s.index}>
                <td>{s.index}</td>
                <td>
                  {s.fanout === 'TRUE1' ? 'TRUE1' : '16A'}
                  {s.forced16A.length > 0 && <Why>{`16A because of ${s.forced16A.join(', ')}`}</Why>}
                </td>
                <td>
                  {s.circuitsUsed} of {s.circuitsUsed + s.spare}
                </td>
                <td>{s.amps} A</td>
                <td>{s.extensionM.length ? metres(s.extensionM) : '-'}</td>
                <td className="cable-fixtures">{s.fixtures.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.fixtureCount > 0 && (
        <p className="cable-jumpers">
          <strong>Jumpers:</strong> {[...p.jumpers.power, ...p.jumpers.data].map((j) => `${j.count} × ${j.label} ${j.lengthM} m`).join(', ') || 'none'}
          <Why>{p.jumpers.why}</Why>
        </p>
      )}
      {p.rigging && (
        <div className="cable-rigging-box">
          <strong>Rigging (not the lighting pack):</strong> {p.rigging.motors} motors, {p.rigging.motors} × motor cable {metres(p.rigging.cableLengthM)}
          <Why>{p.rigging.why}</Why>
        </div>
      )}
      {(p.flags.length > 0 || p.assumed.length > 0) && (
        <ul className="cable-flags">
          {p.flags.map((f, i) => (
            <li key={`f${i}`}>{f}</li>
          ))}
          {p.assumed.map((a, i) => (
            <li key={`a${i}`} className="is-assumed">
              {a}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
