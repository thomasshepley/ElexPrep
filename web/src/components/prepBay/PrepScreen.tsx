import { useEffect, useMemo, useRef, useState } from 'react';
import type { MissingLine, PrepLine, PrepScan, PrepView } from '../../api/client';
import { formatTime } from '../../utils/format';
import { toneFor } from '../../utils/scanFeedback';

/**
 * The prepping layout, read from four metres away by someone holding a fixture: what to pull
 * on the left (next up in the largest type, then the pick list by group), what's done and
 * what's wrong on the right (cases, shortages, recent scans), and the last thing that happened
 * along the bottom with the sign-off button. Every control is a big tap target.
 */
export default function PrepScreen({
  view,
  lastScan,
  locked,
  canAct,
  onAdjust,
  onCasePacked,
  onSignOff,
  onTransport,
}: {
  view: PrepView;
  lastScan: PrepScan | null;
  /** Signed off or booked out: the list is read-only. */
  locked: boolean;
  /** Someone is signed in on the screen. */
  canAct: boolean;
  onAdjust: (line: PrepLine, change: { delta?: 1 | -1; short?: number; shortNote?: string | null }) => Promise<void>;
  onCasePacked: (caseId: string, packed: boolean) => Promise<void>;
  onSignOff: () => Promise<void>;
  onTransport: () => Promise<void>;
}) {
  const [openLine, setOpenLine] = useState<PrepLine | null>(null);
  const [openLocation, setOpenLocation] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'signoff' | 'transport' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);

  const status = view.session?.status ?? 'OPEN';
  const pct = view.totals.required ? Math.round((view.totals.pulled / view.totals.required) * 100) : 0;
  const missing: MissingLine[] = useMemo(
    () =>
      view.groups
        .flatMap((g) => g.lines)
        .filter((l) => l.pulled < l.required)
        .map((l) => ({ key: l.key, name: l.name, required: l.required, pulled: l.pulled, short: l.short, shortNote: l.shortNote })),
    [view]
  );

  // Keep the next unfinished line in view, but leave the list alone for 20 s after a touch.
  useEffect(() => {
    if (!view.next || Date.now() - lastTouch.current < 20_000) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${CSS.escape(view.next.key)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [view.next?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // A line's sheet shows the latest counts as they change.
  const liveOpenLine = openLine ? view.groups.flatMap((g) => g.lines).find((l) => l.key === openLine.key) ?? null : null;
  const location = openLocation ? view.cases.find((c) => c.location === openLocation) ?? null : null;

  return (
    <>
      <main className="bay-main">
        <section className="bay-left" aria-label="To pull">
          <NextUp view={view} status={status} />
          <div
            className="bay-groups"
            ref={listRef}
            onPointerDown={() => {
              lastTouch.current = Date.now();
            }}
          >
            {view.groups.length === 0 && <p className="bay-empty">Nothing on the pick list yet.</p>}
            {view.groups.map((g) => (
              <div key={g.name} className="bay-group">
                <div className="bay-group-head">
                  <h2>{g.name}</h2>
                  <span className="bay-group-count">
                    {g.pulled} / {g.required}
                  </span>
                </div>
                <ProgressBar value={g.pulled} max={g.required} />
                {[...g.lines.filter((l) => !l.done), ...g.lines.filter((l) => l.done)].map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    data-line={l.key}
                    className={`bay-line${l.done ? ' is-done' : ''}${l.short ? ' is-short' : ''}${view.next?.key === l.key ? ' is-next' : ''}${lastScan?.lineKey === l.key ? ' is-last' : ''}`}
                    onClick={() => canAct && !locked && setOpenLine(l)}
                    disabled={!canAct || locked}
                  >
                    <span className="bay-line-name">
                      {l.accessory && <span className="bay-line-acc" aria-hidden="true">↳ </span>}
                      {l.name}
                    </span>
                    {l.short > 0 && <span className="bay-chip bay-chip-amber">{l.short} short</span>}
                    {l.bookedOut && <span className="bay-chip">Booked out</span>}
                    <span className="bay-line-count">
                      {l.pulled}
                      <span className="bay-line-of"> / {l.required}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className="bay-right" aria-label="Progress">
          <div className="bay-card">
            <div className="bay-card-head">
              <h2>Progress</h2>
              <span className="bay-big-number">{pct}%</span>
            </div>
            <ProgressBar value={view.totals.pulled} max={view.totals.required} />
            <p className="bay-card-sub">
              {view.totals.pulled} of {view.totals.required} pulled · {view.totals.linesDone} of {view.totals.lines} lines done
            </p>
          </div>

          {view.cases.length > 0 && (
            <div className="bay-card">
              <h2>Cases</h2>
              {view.cases.map((c) => (
                <button key={c.location} type="button" className="bay-case-row" onClick={() => setOpenLocation(c.location)}>
                  <span className="bay-swatch" style={{ background: c.pattern === 'RAINBOW' ? 'conic-gradient(#D32F2F, #F57C00, #F5C400, #1FA34C, #1976D2, #4B0082, #D32F2F)' : c.color }} aria-hidden="true" />
                  <span className="bay-case-name">{c.location}</span>
                  <span className="bay-case-count">
                    {c.packed} / {c.total}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className={`bay-card${view.shortages.length ? ' bay-card-amber' : ''}`}>
            <h2>Shortages</h2>
            {view.shortages.length === 0 ? (
              <p className="bay-card-sub">No shortages</p>
            ) : (
              view.shortages.map((l) => (
                <div key={l.key} className="bay-shortage">
                  <strong>
                    {l.name}: {l.short} short
                  </strong>
                  {l.shortNote && <span>{l.shortNote}</span>}
                </div>
              ))
            )}
          </div>

          <div className="bay-card bay-recent">
            <h2>Recent scans</h2>
            {view.recentScans.length === 0 && <p className="bay-card-sub">Scan a barcode to start.</p>}
            {view.recentScans.slice(0, 6).map((s) => (
              <div key={s.id} className={`bay-recent-row is-${toneFor(s.result)}`}>
                <span>{s.message}</span>
                <span className="bay-recent-meta">
                  {s.by ? `${s.by}, ` : ''}
                  {formatTime(new Date(s.at))}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <footer className="bay-footer">
        <div className={`bay-last${lastScan ? ` is-${toneFor(lastScan.result)}` : ''}`} aria-live="assertive">
          {lastScan ? lastScan.message : canAct ? 'Ready to scan' : 'Sign in to start prepping'}
        </div>
        {status === 'OPEN' && canAct && (
          <button type="button" className="bay-button bay-button-primary" onClick={() => setConfirm('signoff')}>
            Prep complete
          </button>
        )}
        {status === 'AWAITING_TRANSPORT' && (
          <>
            <div className="bay-signed">
              Signed off{view.session?.completedBy ? ` by ${view.session.completedBy}` : ''}
              {view.session?.completedAt ? ` at ${formatTime(new Date(view.session.completedAt))}` : ''}. Awaiting transport.
            </div>
            {canAct && (
              <button type="button" className="bay-button bay-button-primary" onClick={() => setConfirm('transport')}>
                Transport arrived
              </button>
            )}
          </>
        )}
        {status === 'BOOKED_OUT' && (
          <div className="bay-signed">
            Booked out{view.session?.transportBy ? ` by ${view.session.transportBy}` : ''}
            {view.session?.transportAt ? ` at ${formatTime(new Date(view.session.transportAt))}` : ''}.
          </div>
        )}
      </footer>

      {liveOpenLine && <LineSheet line={liveOpenLine} onClose={() => setOpenLine(null)} onAdjust={(c) => onAdjust(liveOpenLine, c)} />}
      {location && (
        <div className="bay-sheet-backdrop" onClick={() => setOpenLocation(null)}>
          <div className="bay-sheet" role="dialog" aria-label={`${location.location} cases`} onClick={(e) => e.stopPropagation()}>
            <h2>{location.location} cases</h2>
            <div className="bay-sheet-list">
              {location.cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`bay-case-tick${c.packed ? ' is-done' : ''}`}
                  disabled={!canAct || locked}
                  onClick={() => onCasePacked(c.id, !c.packed)}
                >
                  <span className="bay-tick" aria-hidden="true">{c.packed ? '✓' : ''}</span>
                  <span>
                    {c.label}
                    <span className="bay-card-sub"> {c.fixtureType}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="bay-button" onClick={() => setOpenLocation(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <ConfirmSheet
          kind={confirm}
          missing={missing}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === 'signoff') await onSignOff();
            else await onTransport();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bay-progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="bay-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function NextUp({ view, status }: { view: PrepView; status: string }) {
  if (status !== 'OPEN') {
    const short = view.totals.required - view.totals.pulled;
    return (
      <div className={`bay-next ${short > 0 ? 'is-amber' : 'is-done'}`}>
        <span className="bay-next-label">{status === 'BOOKED_OUT' ? 'Booked out' : 'Prep complete'}</span>
        <span className="bay-next-name">
          {view.totals.pulled} of {view.totals.required} pulled
        </span>
        <span className="bay-next-count">{short > 0 ? `${short} missing` : 'Nothing missing'}</span>
      </div>
    );
  }
  if (!view.next) {
    return (
      <div className="bay-next is-done">
        <span className="bay-next-label">Next up</span>
        <span className="bay-next-name">Everything is pulled</span>
        <span className="bay-next-count">Tap Prep complete to sign off</span>
      </div>
    );
  }
  return (
    <div className="bay-next">
      <span className="bay-next-label">Next up{view.next.group ? ` · ${view.next.group}` : ''}</span>
      <span className="bay-next-name">{view.next.name}</span>
      <span className="bay-next-count">
        {view.next.pulled} of {view.next.required}
        {view.next.short > 0 ? ` (${view.next.short} short)` : ''}
      </span>
    </div>
  );
}

function LineSheet({ line, onClose, onAdjust }: { line: PrepLine; onClose: () => void; onAdjust: (change: { delta?: 1 | -1; short?: number; shortNote?: string | null }) => Promise<void> }) {
  const [short, setShort] = useState(line.short || Math.max(1, line.required - line.pulled));
  const [note, setNote] = useState(line.shortNote ?? '');
  const [busy, setBusy] = useState(false);
  const run = async (change: Parameters<typeof onAdjust>[0]) => {
    setBusy(true);
    try {
      await onAdjust(change);
    } finally {
      setBusy(false);
    }
  };
  const remaining = line.required - line.pulled;
  return (
    <div className="bay-sheet-backdrop" onClick={onClose}>
      <div className="bay-sheet" role="dialog" aria-label={line.name} onClick={(e) => e.stopPropagation()}>
        <h2>{line.name}</h2>
        <p className="bay-sheet-count">
          {line.pulled} <span className="bay-line-of">of {line.required} pulled</span>
        </p>
        <div className="bay-sheet-row">
          <button type="button" className="bay-button bay-button-big" disabled={busy || line.pulled === 0} onClick={() => run({ delta: -1 })}>
            − 1
          </button>
          <button type="button" className="bay-button bay-button-big bay-button-primary" disabled={busy || remaining - line.short <= 0} onClick={() => run({ delta: 1 })}>
            + 1
          </button>
        </div>
        <div className="bay-sheet-short">
          <h3>Mark short</h3>
          <div className="bay-sheet-row">
            <button type="button" className="bay-button" disabled={short <= 0} onClick={() => setShort((n) => Math.max(0, n - 1))} aria-label="One fewer short">
              −
            </button>
            <span className="bay-sheet-short-n" aria-live="polite">
              {short} short
            </span>
            <button type="button" className="bay-button" disabled={short >= remaining} onClick={() => setShort((n) => Math.min(remaining, n + 1))} aria-label="One more short">
              +
            </button>
          </div>
          <input className="bay-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. only 10 on the shelf" maxLength={300} aria-label="Shortage note" />
          <div className="bay-sheet-row">
            {line.short > 0 && (
              <button type="button" className="bay-button" disabled={busy} onClick={() => run({ short: 0, shortNote: null })}>
                Clear shortage
              </button>
            )}
            <button type="button" className="bay-button bay-button-amber" disabled={busy || short <= 0} onClick={() => run({ short, shortNote: note || null })}>
              Save shortage
            </button>
          </div>
        </div>
        <button type="button" className="bay-button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function ConfirmSheet({ kind, missing, onCancel, onConfirm }: { kind: 'signoff' | 'transport'; missing: MissingLine[]; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="bay-sheet-backdrop" onClick={onCancel}>
      <div className="bay-sheet" role="dialog" aria-label={kind === 'signoff' ? 'Sign off prep' : 'Transport arrived'} onClick={(e) => e.stopPropagation()}>
        <h2>{kind === 'signoff' ? 'Prep complete?' : 'Transport arrived?'}</h2>
        {kind === 'signoff' ? (
          <p className="bay-card-sub">The list locks and the job waits for transport. An admin can reopen it.</p>
        ) : (
          <p className="bay-card-sub">Everything prepped is booked out.</p>
        )}
        {missing.length > 0 ? (
          <div className="bay-card bay-card-amber">
            <h3>
              {missing.length} {missing.length === 1 ? 'line is' : 'lines are'} not fully pulled. The office will be told.
            </h3>
            {missing.slice(0, 8).map((m) => (
              <div key={m.key} className="bay-shortage">
                <strong>
                  {m.name}: {m.pulled} of {m.required}
                </strong>
                {m.shortNote && <span>{m.shortNote}</span>}
              </div>
            ))}
            {missing.length > 8 && <p className="bay-card-sub">and {missing.length - 8} more</p>}
          </div>
        ) : (
          <p className="bay-card-sub">Everything is pulled.</p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="bay-sheet-row">
          <button type="button" className="bay-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="bay-button bay-button-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {kind === 'signoff' ? 'Sign off' : 'Book out'}
          </button>
        </div>
      </div>
    </div>
  );
}

