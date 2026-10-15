import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { solveRig, type PointResult, type PointState, type Rig, type RigMethod, type RigResult } from '@elexprep/shared';
import { api, type JobRigging, type RigOverrides } from '../../api/client';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useToast } from '../Toast';
import { SkeletonPanel } from '../Skeleton';
import { formatDateTime } from '../../utils/format';
import { PointCard, STATE_LABEL, kg, pct } from './RigParts';
import { ElevationView, PlanView } from './RigViews';

type View = 'plan' | 'elevation' | 'cards';
const VIEW_KEY = 'elex-rig-view';

const METHODS: { value: RigMethod; label: string }[] = [
  { value: 'envelope', label: 'Envelope (larger of both)' },
  { value: 'tributary', label: 'Tributary' },
  { value: 'continuous', label: 'Continuous beam' },
];

function readView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'plan' || v === 'elevation' || v === 'cards' ? v : null;
  } catch {
    return null;
  }
}

/** States change with a little slack on the way back down, so a ring doesn't flicker while a fixture is dragged across a threshold. */
function useSteadyStates(result: RigResult, warnAt: number, overAt: number): RigResult {
  const prev = useRef(new Map<string, PointState>());
  return useMemo(() => {
    const points = result.points.map((p) => {
      const before = prev.current.get(p.pointId);
      let state = p.state;
      if (p.utilisation !== null) {
        const u = p.utilisation * 100;
        if (before === 'warning' && state === 'ok' && u >= warnAt - 2) state = 'warning';
        if (before === 'over' && state === 'warning' && u >= overAt - 2) state = 'over';
      }
      return state === p.state ? p : { ...p, state };
    });
    prev.current = new Map(points.map((p) => [p.pointId, p.state]));
    return { ...result, points };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
}

/**
 * Rigging (beta), admin only: the load on every hoist and venue point against what it may carry,
 * as a plan map, an elevation per truss or a card per point, with the working shown. A planning
 * estimate that feeds the plot; never a sign-off.
 */
export default function RiggingTab({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { showToast } = useToast();
  const phone = useIsPhone();
  const [data, setData] = useState<JobRigging | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rig, setRig] = useState<Rig | null>(null);
  const [overrides, setOverrides] = useState<RigOverrides>({});
  // Phones always open on the point cards; bigger screens open on the view used last.
  const [view, setViewState] = useState<View>(() => (phone ? 'cards' : readView() ?? 'plan'));
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [selectedTruss, setSelectedTruss] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checker, setChecker] = useState('');
  const pending = useRef(false);
  // The latest overrides, for saving at the end of a drag without waiting for a render.
  const overridesRef = useRef<RigOverrides>({});

  const apply = useCallback((d: JobRigging) => {
    setData(d);
    setRig(d.rig);
    setOverrides(d.overrides);
    overridesRef.current = d.overrides;
  }, []);

  useEffect(() => {
    api.rigging
      .job(jobId)
      .then(apply)
      .catch((e) => setError((e as Error).message));
  }, [jobId, apply]);

  // Turning into a phone-sized window (or back) switches to that size's default.
  const wasPhone = useRef(phone);
  useEffect(() => {
    if (wasPhone.current === phone) return;
    wasPhone.current = phone;
    setViewState(phone ? 'cards' : readView() ?? 'plan');
  }, [phone]);

  const setView = (v: View) => {
    setViewState(v);
    if (phone) return;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not remembered; fine.
    }
  };

  const save = useCallback(
    async (next: { overrides?: RigOverrides; method?: RigMethod }) => {
      setSaving(true);
      try {
        const d = await api.rigging.save(jobId, next);
        pending.current = false;
        apply(d);
      } catch (e) {
        showToast((e as Error).message, 'error');
      } finally {
        setSaving(false);
      }
    },
    [jobId, apply, showToast]
  );

  const solved = useMemo(() => (rig ? solveRig(rig) : null), [rig]);
  const result = useSteadyStates(solved ?? { points: [], trusses: [], totals: { hungKg: 0, points: 0, heaviest: null, overCount: 0, warningCount: 0, unknownCount: 0 }, notes: [] }, rig?.settings.warnAtPct ?? 80, rig?.settings.overAtPct ?? 100);

  if (error) return <p className="error">Could not load the rigging calculator: {error}</p>;
  if (!data || !rig || !solved) return <SkeletonPanel height={360} />;

  const resById = new Map(result.points.map((r) => [r.pointId, r]));
  const trussOfPoint = new Map<string, string>();
  for (const t of rig.trusses) for (const h of t.hoists) trussOfPoint.set(h.pointId, t.name);
  const hoistLabel = (pointId: string) => {
    const p = rig.points.find((x) => x.id === pointId);
    return p?.hoist ? `${p.hoist.name} (${p.hoist.hoistClass})` : null;
  };

  // Fixture drags change the rig straight away and save once the drag ends.
  const moveFixture = (trussId: string, fixtureId: string, x: number) => {
    pending.current = true;
    setRig((r) =>
      r && {
        ...r,
        trusses: r.trusses.map((t) => (t.id !== trussId ? t : { ...t, loads: t.loads.map((l) => (l.kind === 'point' && l.ref === fixtureId ? { ...l, x } : l)) })),
      }
    );
    const o = overridesRef.current;
    const next = { ...o, trusses: { ...o.trusses, [trussId]: { ...o.trusses?.[trussId], fixtureX: { ...o.trusses?.[trussId]?.fixtureX, [fixtureId]: x } } } };
    overridesRef.current = next;
    setOverrides(next);
  };
  const commitMoves = () => {
    if (pending.current) void save({ overrides: overridesRef.current });
  };

  const setPoint = (pointId: string, patch: NonNullable<RigOverrides['points']>[string]) =>
    save({ overrides: { ...overrides, points: { ...overrides.points, [pointId]: { ...overrides.points?.[pointId], ...patch } } } });

  const setTruss = (trussId: string, patch: NonNullable<RigOverrides['trusses']>[string]) =>
    save({ overrides: { ...overrides, trusses: { ...overrides.trusses, [trussId]: { ...overrides.trusses?.[trussId], ...patch } } } });

  const addHoist = (trussId: string, xAlong: number) => {
    const t = rig.trusses.find((x) => x.id === trussId)!;
    const id = `add:${Date.now().toString(36)}`;
    const count = rig.points.filter((p) => p.kind !== 'cablePick').length + 1;
    void save({
      overrides: {
        ...overrides,
        addedPoints: [...(overrides.addedPoints ?? []), { id, name: `P-${count}`, x: Math.round((t.originX + xAlong) * 100) / 100, y: t.y, kind: 'hoist' }],
        trusses: { ...overrides.trusses, [trussId]: { ...overrides.trusses?.[trussId], hoists: [...t.hoists, { pointId: id, x: xAlong }] } },
      },
    });
  };

  const removeHoist = (trussId: string, pointId: string) => {
    const t = rig.trusses.find((x) => x.id === trussId)!;
    void save({
      overrides: {
        ...overrides,
        removedPointIds: [...(overrides.removedPointIds ?? []), pointId],
        trusses: { ...overrides.trusses, [trussId]: { ...overrides.trusses?.[trussId], hoists: t.hoists.filter((h) => h.pointId !== pointId) } },
      },
    });
  };

  const moveHoist = (trussId: string, pointId: string, x: number) => {
    const t = rig.trusses.find((tt) => tt.id === trussId)!;
    void save({
      overrides: {
        ...overrides,
        points: { ...overrides.points, [pointId]: { ...overrides.points?.[pointId], x: Math.round((t.originX + x) * 100) / 100 } },
        trusses: { ...overrides.trusses, [trussId]: { ...overrides.trusses?.[trussId], hoists: t.hoists.map((h) => (h.pointId === pointId ? { ...h, x } : h)) } },
      },
    });
  };

  const selected = selectedPoint ? resById.get(selectedPoint) ?? null : null;
  const truss = selectedTruss ? rig.trusses.find((t) => t.id === selectedTruss) ?? null : null;
  const t = result.totals;

  const printNow = () => {
    document.body.classList.add('print-rigging');
    const done = () => {
      document.body.classList.remove('print-rigging');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  };

  return (
    <div className="rig-tab">
      <p className="rig-banner" role="note">
        <strong>Beta, admins only.</strong> {data.disclaimer}
      </p>

      {data.plotNote && (rig.points.length > 0 || rig.trusses.length > 0) && (
        <p className="rig-plot-note" role="status">
          {data.plotNote}
        </p>
      )}

      <div className="rig-toolbar">
        <div className="tabs tabs-sub rig-views" role="tablist" aria-label="View">
          {(['plan', 'elevation', 'cards'] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {v === 'plan' ? 'Plan map' : v === 'elevation' ? 'Elevation' : 'Point cards'}
            </button>
          ))}
        </div>
        <label className="field rig-method">
          <span className="field-label">Method</span>
          <select value={rig.settings.method} onChange={(e) => save({ method: e.target.value as RigMethod })} disabled={saving}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="rig-badge">Static + {rig.settings.marginPct}% margin</span>
        <div className="row-actions">
          <a className="button secondary" href={api.rigging.csvUrl(jobId)} download>
            Point table CSV
          </a>
          <button type="button" className="secondary" onClick={printNow}>
            Print
          </button>
        </div>
      </div>

      <div className="rig-summary">
        <div>
          <span className="rig-summary-n">{kg(t.hungKg)}</span>
          <span className="muted">hung in total</span>
        </div>
        <div>
          <span className="rig-summary-n">{t.points}</span>
          <span className="muted">points</span>
        </div>
        <div>
          <span className="rig-summary-n">{t.heaviest ? kg(t.heaviest.kg) : '-'}</span>
          <span className="muted">heaviest{t.heaviest ? `, ${t.heaviest.name}` : ''}</span>
        </div>
        <div className={t.overCount ? 'is-over' : ''}>
          <span className="rig-summary-n">{t.overCount}</span>
          <span className="muted">over capacity or uplift</span>
        </div>
        <div className={t.warningCount ? 'is-warning' : ''}>
          <span className="rig-summary-n">{t.warningCount}</span>
          <span className="muted">warnings</span>
        </div>
        <div className={t.unknownCount ? 'is-unknown' : ''}>
          <span className="rig-summary-n">{t.unknownCount}</span>
          <span className="muted">no capacity</span>
        </div>
      </div>

      {rig.points.length === 0 && rig.trusses.length === 0 ? (
        <section className="panel">
          <p>Nothing to work out yet. {data.plotNote ?? 'Import a patch with a Position column so the trusses appear here.'}</p>
        </section>
      ) : (
        <div className={`rig-layout${view === 'plan' ? '' : ' is-wide'}`}>
          <section className={`panel rig-main${view === 'cards' ? ' is-cards' : ''}`}>
            {view === 'plan' && (
              <PlanView
                rig={rig}
                result={result}
                selectedPointId={selectedPoint}
                selectedTrussId={selectedTruss}
                onSelectPoint={(id) => {
                  setSelectedPoint(id);
                  setSelectedTruss(null);
                }}
                onSelectTruss={(id) => {
                  setSelectedTruss(id);
                  setSelectedPoint(null);
                }}
              />
            )}
            {view === 'elevation' &&
              rig.trusses.map((tr) => (
                <div key={tr.id} className="rig-elev-block">
                  <h3>{tr.name}</h3>
                  <ElevationView
                    truss={tr}
                    rig={rig}
                    result={result}
                    selectedPointId={selectedPoint}
                    onSelectPoint={(id) => setSelectedPoint(id)}
                    onMoveFixture={(fid, x) => moveFixture(tr.id, fid, x)}
                    onMoveEnd={commitMoves}
                  />
                </div>
              ))}
            {view === 'elevation' && rig.trusses.length === 0 && <p className="muted">No trusses yet.</p>}
            {view === 'cards' && (
              <div className="rig-cards">
                {[...result.points]
                  .sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1))
                  .map((r) => (
                    <PointCard
                      key={r.pointId}
                      r={r}
                      settings={rig.settings}
                      hoistLabel={hoistLabel(r.pointId)}
                      trussName={trussOfPoint.get(r.pointId) ?? null}
                      selected={r.pointId === selectedPoint}
                      onSelect={() => setSelectedPoint((s) => (s === r.pointId ? null : r.pointId))}
                      explain={r.pointId === selectedPoint}
                    />
                  ))}
              </div>
            )}
          </section>
          {view === 'elevation' && selected && (
            <aside className="rig-inspector" aria-label="Selected">
              <PointCard r={selected} settings={rig.settings} hoistLabel={hoistLabel(selected.pointId)} trussName={trussOfPoint.get(selected.pointId) ?? null} explain />
            </aside>
          )}
          {view === 'plan' && (
            <aside className="rig-inspector" aria-label="Selected">
              {selected ? (
                <PointCard r={selected} settings={rig.settings} hoistLabel={hoistLabel(selected.pointId)} trussName={trussOfPoint.get(selected.pointId) ?? null} explain />
              ) : truss ? (
                <div className="panel">
                  <h3>{truss.name}</h3>
                  <ElevationView
                    truss={truss}
                    rig={rig}
                    result={result}
                    onSelectPoint={(id) => setSelectedPoint(id)}
                    onMoveFixture={(fid, x) => moveFixture(truss.id, fid, x)}
                    onMoveEnd={commitMoves}
                  />
                  <p className="muted">Open Elevation for every truss at full size.</p>
                  <TrussChecks tr={result.trusses.find((x) => x.trussId === truss.id) ?? null} />
                </div>
              ) : (
                <div className="panel rig-inspector-empty">
                  <p className="muted">Select a point to see its load and where it comes from, or a truss to see it in elevation and move its fixtures.</p>
                  <Legend rig={rig} />
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      <PointTable
        data={data}
        result={result}
        trussOfPoint={trussOfPoint}
        onSelect={(id) => setSelectedPoint(id)}
        onPoint={setPoint}
        saving={saving}
        onSaveVenue={async () => {
          try {
            const r = await api.rigging.saveVenue(jobId);
            showToast(`${r.saved} capacities saved for ${r.venue}`, 'success');
          } catch (e) {
            showToast((e as Error).message, 'error');
          }
        }}
      />

      <PlotLinks
        data={data}
        onLink={async (positionId, plotTruss) => {
          try {
            await api.cable.updatePosition(jobId, positionId, { plotTruss });
            apply(await api.rigging.job(jobId));
          } catch (e) {
            showToast((e as Error).message, 'error');
          }
        }}
      />

      <section className="panel">
        <h2>Trusses</h2>
        {rig.trusses.length === 0 && <p className="muted">No trusses: positions come from the patch's Position column.</p>}
        <div className="rig-truss-grid">
          {rig.trusses.map((tr) => {
            const tres = result.trusses.find((x) => x.trussId === tr.id) ?? null;
            const info = data.trusses.find((x) => x.id === tr.id);
            return (
              <article key={tr.id} className="rig-truss-card">
                <header className="panel-heading-row">
                  <h3>{tr.name}</h3>
                  <span className="muted">
                    {tres ? `${kg(tres.hungKg)} hung, ${kg(tres.selfKg)} of it truss` : ''}
                    {info?.fromPlot ? ' · from the plot' : ''}
                  </span>
                </header>
                <div className="form-grid settings-grid">
                  <label className="field">
                    <span className="field-label">Truss</span>
                    <select value={tr.profile?.id ?? ''} onChange={(e) => setTruss(tr.id, { profileId: e.target.value || null })} disabled={saving}>
                      <option value="">None (no self-weight)</option>
                      {data.trussProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Length (m)</span>
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      defaultValue={tr.lengthM}
                      key={`len:${tr.lengthM}`}
                      onBlur={(e) => Number(e.target.value) !== tr.lengthM && Number(e.target.value) > 0 && setTruss(tr.id, { lengthM: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <h4>Hoists</h4>
                <table className="rig-hoist-table">
                  <thead>
                    <tr>
                      <th>Point</th>
                      <th>Along the truss (m)</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...tr.hoists]
                      .sort((a, b) => a.x - b.x)
                      .map((h) => (
                        <tr key={h.pointId}>
                          <td>{resById.get(h.pointId)?.name ?? h.pointId}</td>
                          <td>
                            <input
                              className="cable-num"
                              type="number"
                              step={0.1}
                              defaultValue={h.x}
                              key={`hx:${h.pointId}:${h.x}`}
                              aria-label={`${resById.get(h.pointId)?.name} position along ${tr.name}`}
                              onBlur={(e) => Number(e.target.value) !== h.x && moveHoist(tr.id, h.pointId, Number(e.target.value))}
                            />
                          </td>
                          <td className="row-actions">
                            <button type="button" className="secondary" onClick={() => removeHoist(tr.id, h.pointId)} disabled={saving}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <AddHoist length={tr.lengthM} onAdd={(x) => addHoist(tr.id, x)} disabled={saving} />
                <TrussChecks tr={tres} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Assumptions</h2>
        <ul className="rig-assumptions">
          {result.notes.map((n, i) => (
            <li key={`n${i}`}>{n}</li>
          ))}
          {data.assumptions.map((a, i) => (
            <li key={`a${i}`}>{a}</li>
          ))}
          <li>
            Venue points are treated as vertical drops (no bridles). Weights come from <Link to="/settings/fixtures">the fixture database</Link> and{' '}
            <Link to="/settings/rigging">the rigging settings</Link>.
          </li>
        </ul>
      </section>

      <section className="panel rig-record">
        <h2>Record</h2>
        <p>
          <strong>Calculated by:</strong> {data.record.calculatedBy ? `${data.record.calculatedBy}, ${formatDateTime(data.record.calculatedAt!)}` : 'Nobody has changed this rig yet'}
        </p>
        {data.record.checkedByName ? (
          <p>
            <strong>Checked by:</strong> {data.record.checkedByName}, {formatDateTime(data.record.checkedAt!)}{' '}
            <button type="button" className="link-button" onClick={async () => apply(await api.rigging.clearCheck(jobId))}>
              Clear
            </button>
          </p>
        ) : (
          <form
            className="rig-check-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                apply(await api.rigging.check(jobId, checker));
                setChecker('');
                showToast('Recorded as checked', 'success');
              } catch (err) {
                showToast((err as Error).message, 'error');
              }
            }}
          >
            <label className="field">
              <span className="field-label">Checked by (name, e.g. the NRC Level 3 rigger)</span>
              <input value={checker} onChange={(e) => setChecker(e.target.value)} required maxLength={120} />
            </label>
            <button type="submit" disabled={!checker.trim()}>
              Record check
            </button>
          </form>
        )}
        <p className="muted">Changing the rig after it has been checked clears the check, so a check always matches what's shown.</p>
      </section>

      {createPortal(<PrintView jobName={jobName} data={data} rig={rig} result={result} trussOfPoint={trussOfPoint} />, document.body)}
    </div>
  );
}

const HOW: Record<string, string> = { linked: 'linked by hand', name: 'same name', 'only one left': 'the only one left', 'by depth': 'front to back: check it' };

/**
 * How the patch's truss positions line up with the trusses on the CAD plot: matched by name
 * however it's written, or linked here by hand. A truss on the plot that nothing is linked to
 * still has its motors, which carry the load printed on the plot.
 */
function PlotLinks({ data, onLink }: { data: JobRigging; onLink: (positionId: string, plotTruss: string | null) => void }) {
  const { positions, plotTrusses } = data.links;
  if (!plotTrusses.length || !positions.length) return null;
  const linked = new Set(positions.map((p) => p.matched).filter(Boolean));
  const spare = plotTrusses.filter((t) => !linked.has(t.position));
  const unmatched = positions.filter((p) => !p.matched && p.plotTruss !== '');
  return (
    <section className={`panel rig-links${unmatched.length ? ' needs-attention' : ''}`}>
      <div className="panel-heading-row">
        <h2>Plot and patch</h2>
        <span className="muted">
          {plotTrusses.length} truss{plotTrusses.length === 1 ? '' : 'es'} and {plotTrusses.reduce((n, t) => n + t.motors, 0)} motors on the plot
        </span>
      </div>
      <p className="muted">
        Each patch position is matched to a truss on the plot by name, however it's written ("US Truss" is "Upstage" is "US"). Where the names don't line up, pick the
        plot truss here: its motors then hold up that position's fixtures.
      </p>
      <div className="table-scroll">
        <table className="rig-links-table">
          <thead>
            <tr>
              <th>Patch position</th>
              <th className="num">Fixtures</th>
              <th>On the plot as</th>
              <th>Matched by</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className={!p.matched && p.plotTruss !== '' ? 'is-unmatched' : ''}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td className="num">{p.fixtures}</td>
                <td>
                  <select
                    value={p.plotTruss === null ? '' : p.plotTruss === '' ? '__none' : p.plotTruss}
                    aria-label={`Plot truss for ${p.name}`}
                    onChange={(e) => onLink(p.id, e.target.value === '' ? null : e.target.value === '__none' ? '' : e.target.value)}
                  >
                    <option value="">{p.matched && p.how !== 'linked' ? `Automatic: ${p.matched}` : 'Automatic: no match'}</option>
                    {plotTrusses.map((t) => (
                      <option key={t.position} value={t.position}>
                        {t.position} ({t.motors} motor{t.motors === 1 ? '' : 's'}, {t.lengthM} m)
                      </option>
                    ))}
                    <option value="__none">Not on the plot</option>
                  </select>
                </td>
                <td className="muted">{p.matched ? HOW[p.how ?? ''] ?? '' : p.plotTruss === '' ? 'not on the plot' : <strong className="rig-neg">no match: pick one</strong>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {spare.length > 0 && (
        <p className="muted">
          On the plot but not linked to a patch position: {spare.map((t) => `${t.position} (${t.motors} motor${t.motors === 1 ? '' : 's'})`).join(', ')}. Their motors carry the load
          printed on the plot.
        </p>
      )}
    </section>
  );
}

function Legend({ rig }: { rig: Rig }) {
  return (
    <ul className="rig-legend">
      <li>
        <span className="rig-state is-ok">OK</span> under {rig.settings.warnAtPct}%
      </li>
      <li>
        <span className="rig-state is-warning">Warning</span> {rig.settings.warnAtPct}% to {rig.settings.overAtPct}%
      </li>
      <li>
        <span className="rig-state is-over">Over capacity</span> {rig.settings.overAtPct}% and over
      </li>
      <li>
        <span className="rig-state is-unknown">Unknown capacity</span> no figure entered
      </li>
      <li>
        <span className="rig-state is-uplift">Uplift</span> the truss lifts off this point
      </li>
    </ul>
  );
}

function AddHoist({ length, onAdd, disabled }: { length: number; onAdd: (x: number) => void; disabled: boolean }) {
  const [x, setX] = useState('');
  return (
    <form
      className="rig-add-hoist"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(x);
        if (Number.isFinite(n) && n >= -2 && n <= length + 2) {
          onAdd(n);
          setX('');
        }
      }}
    >
      <label className="field">
        <span className="field-label">Add a hoist at (m along)</span>
        <input type="number" step={0.1} value={x} onChange={(e) => setX(e.target.value)} placeholder={`0 to ${length}`} />
      </label>
      <button type="submit" className="secondary" disabled={disabled || x === ''}>
        Add hoist
      </button>
    </form>
  );
}

function TrussChecks({ tr }: { tr: RigResult['trusses'][number] | null }) {
  if (!tr) return null;
  return (
    <div className="rig-checks">
      {tr.spans.length > 0 && (
        <div className="table-scroll">
          <table className="rig-span-table">
            <thead>
              <tr>
                <th>Span</th>
                <th className="num">Length</th>
                <th className="num">Load</th>
                <th className="num">Allowed</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {tr.spans.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.from} to {s.to}
                  </td>
                  <td className="num">{s.lengthM} m</td>
                  <td className="num">{kg(s.loadKg)}</td>
                  <td className="num">{s.allowableKg === null ? '-' : kg(s.allowableKg)}</td>
                  <td>{s.ok === null ? <span className="muted">No table figure</span> : s.ok ? 'OK' : <strong className="rig-neg">Over the table</strong>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tr.cantilevers.map((c) => (
        <p key={c.end} className={c.ok === false ? 'rig-flag' : 'muted'}>
          Cantilever at the {c.end === 'start' ? 'start' : 'end'}: {c.lengthM} m{c.maxM !== null ? `, limit ${c.maxM} m` : ''}
          {c.ok === false ? '. Longer than the profile allows.' : ''}
        </p>
      ))}
      {tr.suggestion && <p className="muted">To even it up: {tr.suggestion}.</p>}
      {tr.notes.map((n, i) => (
        <p key={i} className="muted">
          {n}.
        </p>
      ))}
    </div>
  );
}

function PointTable({
  data,
  result,
  trussOfPoint,
  onSelect,
  onPoint,
  saving,
  onSaveVenue,
}: {
  data: JobRigging;
  result: RigResult;
  trussOfPoint: Map<string, string>;
  onSelect: (id: string) => void;
  onPoint: (id: string, patch: NonNullable<RigOverrides['points']>[string]) => void;
  saving: boolean;
  onSaveVenue: () => void;
}) {
  const pointById = new Map(data.rig.points.map((p) => [p.id, p]));
  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Points</h2>
        <div className="row-actions">
          {data.venue && (
            <button type="button" className="secondary" onClick={onSaveVenue}>
              Save capacities for {data.venue}
            </button>
          )}
        </div>
      </div>
      <p className="muted">
        Laid out like the plot's Rigging Points table so it can be checked line by line. Capacities come from the plot, from capacities saved for this venue, or
        what's typed here.{data.plotName ? ` Points read from ${data.plotName}.` : ''}
      </p>
      <div className="table-scroll">
        <table className="rig-point-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">X</th>
              <th className="num">Y</th>
              <th>Capacity (SWL)</th>
              <th className="num">Applied</th>
              <th className="num">Load + margin</th>
              <th>State</th>
              <th>Position</th>
              <th>Type</th>
              <th>Hoist</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((r: PointResult) => {
              const p = pointById.get(r.pointId);
              if (!p) return null;
              return (
                <tr key={r.pointId}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onSelect(r.pointId)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="num">{p.x}</td>
                  <td className="num">{p.y}</td>
                  <td>
                    <input
                      className="cable-num"
                      type="number"
                      min={0}
                      defaultValue={r.capacityKg ?? ''}
                      key={`cap:${r.pointId}:${r.capacityKg}`}
                      placeholder="kg"
                      aria-label={`${r.name} capacity`}
                      onBlur={(e) => {
                        const v = e.target.value.trim() === '' ? null : Number(e.target.value);
                        if (v !== r.capacityKg) onPoint(r.pointId, { capacityKg: v });
                      }}
                    />
                    {r.capacitySource && <span className="muted rig-src">{r.capacitySource === 'PLOT' ? 'plot' : r.capacitySource === 'VENUE' ? 'venue' : 'entered'}</span>}
                  </td>
                  <td className="num">{kg(r.appliedKg)}</td>
                  <td className="num">
                    <strong>{kg(r.pointLoadKg)}</strong>
                  </td>
                  <td>
                    <span className={`rig-state is-${r.state}`}>
                      {STATE_LABEL[r.state]}
                      {r.utilisation !== null ? ` ${pct(r.utilisation)}` : ''}
                    </span>
                  </td>
                  <td>{p.kind === 'cablePick' ? 'Cable pick' : trussOfPoint.get(r.pointId) ?? <span className="muted">Not on a truss</span>}</td>
                  <td>
                    <select value={p.kind} onChange={(e) => onPoint(r.pointId, { kind: e.target.value as 'hoist' })} disabled={saving} aria-label={`${r.name} type`}>
                      <option value="hoist">Hoist</option>
                      <option value="deadHang">Dead hang</option>
                      <option value="cablePick">Cable pick</option>
                    </select>
                  </td>
                  <td>
                    {p.kind === 'hoist' ? (
                      <select value={p.hoist?.id ?? ''} onChange={(e) => onPoint(r.pointId, { hoistModelId: e.target.value || null })} disabled={saving} aria-label={`${r.name} hoist`}>
                        <option value="">None</option>
                        {data.hoistModels.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.hoistClass})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What the Print button prints: the venue's format, elevation per truss, point table, assumptions, sign lines. */
function PrintView({ jobName, data, rig, result, trussOfPoint }: { jobName: string; data: JobRigging; rig: Rig; result: RigResult; trussOfPoint: Map<string, string> }) {
  return (
    <div className="rig-print" aria-hidden="true">
      <h1>{jobName}: rigging loads</h1>
      <p>
        <strong>{data.disclaimer}</strong>
      </p>
      <p>
        Method: {METHODS.find((m) => m.value === rig.settings.method)?.label}. Static loads plus a {rig.settings.marginPct}% safety margin. Point loads include
        the hoist, its chain and a {rig.settings.riggingAllowanceKg} kg rigging allowance. Printed {formatDateTime(new Date())}.
      </p>
      {rig.trusses.map((t) => (
        <div key={t.id} className="rig-print-truss">
          <h2>{t.name}</h2>
          <ElevationView truss={t} rig={rig} result={result} readOnly />
        </div>
      ))}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>X (m)</th>
            <th>Y (m)</th>
            <th>Capacity</th>
            <th>Applied</th>
            <th>Load + margin</th>
            <th>Use</th>
            <th>State</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {result.points.map((r) => {
            const p = rig.points.find((x) => x.id === r.pointId)!;
            return (
              <tr key={r.pointId}>
                <td>{r.name}</td>
                <td>{p.x}</td>
                <td>{p.y}</td>
                <td>{r.capacityKg ? `${kg(r.capacityKg)} (${(r.capacityKg * 0.00981).toFixed(2)} kN)` : '-'}</td>
                <td>{kg(r.appliedKg)}</td>
                <td>
                  {kg(r.pointLoadKg)} ({(r.pointLoadKg * 0.00981).toFixed(2)} kN)
                </td>
                <td>{pct(r.utilisation)}</td>
                <td>{STATE_LABEL[r.state]}</td>
                <td>{p.kind === 'cablePick' ? 'Cable pick' : trussOfPoint.get(r.pointId) ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Assumptions</h2>
      <ul>
        {[...result.notes, ...data.assumptions].map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      <div className="rig-print-sign">
        <p>
          Calculated by: {data.record.calculatedBy ?? '________________'} {data.record.calculatedAt ? `(${formatDateTime(data.record.calculatedAt)})` : ''}
        </p>
        <p>Checked by: {data.record.checkedByName ? `${data.record.checkedByName} (${formatDateTime(data.record.checkedAt!)})` : '________________   Date: __________'}</p>
      </div>
    </div>
  );
}
