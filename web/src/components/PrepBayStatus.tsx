import { useCallback, useEffect, useState } from 'react';
import { api, type PrepScan, type PrepView } from '../api/client';
import { useDialog } from './Dialog';
import { useToast } from './Toast';
import { formatDateTime, formatTime } from '../utils/format';

const STATUS_LABEL: Record<string, string> = { OPEN: 'Prepping', AWAITING_TRANSPORT: 'Awaiting transport', BOOKED_OUT: 'Booked out' };

/**
 * Admin view of this job's prep at the bay: where it's up to, anything flagged missing at
 * sign-off or book-out, and the scan log. Shown at the top of the job's Prep tab once a prep has
 * started; nothing shows for a job nobody has prepped yet.
 */
export default function PrepBayStatus({ jobId }: { jobId: string }) {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Pick<PrepView, 'session' | 'totals' | 'source'> | null>(null);
  const [scans, setScans] = useState<(PrepScan & { createdAt: string })[] | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(() => {
    api.prepJob
      .status(jobId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [jobId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (showLog) api.prepJob.scans(jobId).then(setScans).catch(() => setScans([]));
  }, [showLog, jobId]);

  const session = status?.session;
  if (!status || !session) return null;
  const flagged = Boolean(session.flaggedAt && !session.flagResolvedAt);
  const missing = session.bookOut?.notPrepped?.length ? session.bookOut.notPrepped : session.missing;

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      showToast(done, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    load();
  };

  return (
    <section className={`panel prep-bay-status${flagged ? ' is-flagged' : ''}`} aria-label="Bay prep">
      <div className="panel-heading-row">
        <h2>
          Bay prep: {STATUS_LABEL[session.status]}
          <span className="muted" style={{ fontWeight: 400 }}>
            {' '}
            · {status.totals.pulled} of {status.totals.required} pulled
          </span>
        </h2>
        <div className="row-actions">
          {flagged && (
            <button type="button" className="secondary" onClick={() => act(() => api.prepJob.resolveFlag(jobId), 'Marked resolved')}>
              Mark resolved
            </button>
          )}
          {session.status !== 'OPEN' && (
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: session.status === 'BOOKED_OUT' ? 'Start a new prep?' : 'Reopen this prep?',
                  message:
                    session.status === 'BOOKED_OUT'
                      ? 'The bay starts counting this job from zero again. The last prep stays in the activity log.'
                      : 'The bay can scan into it again until it is signed off.',
                  confirmLabel: session.status === 'BOOKED_OUT' ? 'Start new prep' : 'Reopen',
                });
                if (ok) await act(() => api.prepJob.reopen(jobId), session.status === 'BOOKED_OUT' ? 'New prep started' : 'Prep reopened');
              }}
            >
              {session.status === 'BOOKED_OUT' ? 'Start new prep' : 'Reopen prep'}
            </button>
          )}
          <button type="button" className="secondary" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            {showLog ? 'Hide scan log' : 'Scan log'}
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Started {formatDateTime(session.startedAt)}
        {session.startedBy ? ` by ${session.startedBy}` : ''}
        {session.completedAt ? `. Signed off ${formatDateTime(session.completedAt)}${session.completedBy ? ` by ${session.completedBy}` : ''}` : ''}
        {session.transportAt ? `. Booked out ${formatDateTime(session.transportAt)}${session.transportBy ? ` by ${session.transportBy}` : ''}` : ''}.
        {session.bookOut && session.bookOut.mode !== 'OFF' && (
          <>
            {' '}
            {session.bookOut.mode === 'DRY_RUN' ? 'Dry run: ' : ''}
            {session.bookOut.itemAssetIds.length} units {session.bookOut.mode === 'DRY_RUN' ? 'would have been' : 'were'} booked out in Current RMS.
          </>
        )}
      </p>
      {session.bookOut?.errors?.length ? <p className="error">Current RMS: {session.bookOut.errors.join('; ')}</p> : null}
      {missing.length > 0 && session.status !== 'OPEN' && (
        <div className={`prep-bay-missing${flagged ? '' : ' is-resolved'}`}>
          <strong>
            {missing.length} {missing.length === 1 ? 'line' : 'lines'} not fully pulled
            {!flagged && session.flagResolvedBy ? ` (resolved by ${session.flagResolvedBy})` : ''}
          </strong>
          <ul>
            {missing.map((m) => (
              <li key={m.key}>
                {m.name}: {m.pulled} of {m.required}
                {m.short ? `, ${m.short} marked short` : ''}
                {m.shortNote ? ` (${m.shortNote})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showLog && (
        <div className="table-scroll" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>What happened</th>
                <th>Code</th>
                <th>From</th>
                <th>Who</th>
              </tr>
            </thead>
            <tbody>
              {scans?.map((s) => (
                <tr key={s.id}>
                  <td>{formatTime(new Date(s.createdAt))}</td>
                  <td>{s.message}</td>
                  <td>{s.kind === 'TAP' ? <span className="muted">Tap</span> : <code>{s.code}</code>}</td>
                  <td>{s.source === 'PHONE' ? 'Phone' : s.source === 'TAP' ? 'Screen' : 'Scanner'}</td>
                  <td>{s.by ?? ''}</td>
                </tr>
              ))}
              {scans?.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No scans yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
