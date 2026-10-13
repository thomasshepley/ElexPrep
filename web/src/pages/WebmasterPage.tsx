import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type BugReport } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { formatDateTime, formatTime } from '../utils/format';
import { bugReportsToMarkdown, downloadMarkdown } from '../bugReport/exportMarkdown';
import ActivityLogPage from './ActivityLogPage';

function SiteControlsPanel() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<'development' | 'full' | null>(null);

  const toggle = async (tier: 'development' | 'full', enabled: boolean) => {
    setBusy(tier);
    try {
      if (tier === 'development') await api.lockdown.setDevelopment(enabled);
      else await api.lockdown.setFull(enabled);
      const refreshed = await api.auth.me();
      setUser(refreshed);
      showToast(
        `${tier === 'development' ? 'Development' : 'Full'} lockdown ${enabled ? 'enabled' : 'disabled'}.`,
        'success'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginTop: 0 }}>Site controls</h3>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <strong>Development lockdown</strong>
          <p className="muted" style={{ margin: 0 }}>
            Blocks everyone except admins/webmasters from signing in or using the API - for planned maintenance.
          </p>
        </div>
        <button
          className={user?.developmentLockdown ? 'secondary' : 'primary'}
          disabled={busy !== null}
          onClick={() => toggle('development', !user?.developmentLockdown)}
        >
          {user?.developmentLockdown ? 'Disable' : 'Enable'}
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Full lockdown</strong>
          <p className="muted" style={{ margin: 0 }}>
            Blocks everyone except webmasters, admins included - the strictest tier.
          </p>
        </div>
        <button
          className={user?.fullLockdown ? 'secondary' : 'primary'}
          disabled={busy !== null}
          onClick={() => toggle('full', !user?.fullLockdown)}
        >
          {user?.fullLockdown ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  );
}

function ReportRow({ report, onRemove }: { report: BugReport; onRemove: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <strong>{report.reporterName}</strong> <span className="chip chip-role">{report.reporterRole}</span>
          <p className="muted" style={{ margin: '0.3rem 0 0' }}>
            {formatDateTime(report.createdAt)} · {report.pageUrl}
          </p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button className="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          <button className="secondary" onClick={() => onRemove(report.id)}>
            Delete
          </button>
        </div>
      </div>
      {report.notes && <p style={{ marginBottom: 0 }}>{report.notes}</p>}
      {expanded && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="muted" style={{ margin: 0 }}>
            Page title: {report.pageTitle ?? '-'}
            <br />
            Viewport: {report.viewportWidth ?? '?'}×{report.viewportHeight ?? '?'}
            <br />
            User agent: {report.userAgent ?? '-'}
          </p>
          <h4 style={{ marginBottom: '0.4rem' }}>Recent actions</h4>
          {report.recentActions.length === 0 ? (
            <p className="muted">No actions captured.</p>
          ) : (
            <ul style={{ margin: 0 }}>
              {report.recentActions.map((a, i) => (
                <li key={i} className="muted">
                  {formatTime(a.time)} - {a.type}: {a.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function WebmasterPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'controls' | 'bugs' | 'activity'>('bugs');

  const refresh = () => api.bugReports.list().then(setReports).catch((e) => setError(e.message));

  useEffect(() => {
    if (user?.role === 'WEBMASTER') refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (user && user.role !== 'WEBMASTER') return <Navigate to="/" replace />;

  const remove = async (id: string) => {
    try {
      await api.bugReports.remove(id);
      refresh();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(bugReportsToMarkdown(reports));
      showToast(`Copied ${reports.length} report${reports.length === 1 ? '' : 's'} as Markdown`, 'success');
    } catch {
      showToast("Couldn't copy to the clipboard - use Download .md instead", 'error');
    }
  };

  const download = () => {
    const now = new Date();
    downloadMarkdown(bugReportsToMarkdown(reports, now), now);
  };

  return (
    <div>
      <h1>Webmaster</h1>
      <div className="tabs" role="tablist" aria-label="Webmaster sections">
        {(
          [
            ['bugs', `Bug reports${reports.length ? ` (${reports.length})` : ''}`],
            ['activity', 'Activity log'],
            ['controls', 'Site controls'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'controls' && <SiteControlsPanel />}
      {tab === 'activity' && <ActivityLogPage />}
      {tab === 'bugs' && (
      <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          Bug reports submitted from anywhere in the app.
        </p>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button className="secondary" onClick={copyAll} disabled={reports.length === 0}>
            Copy all
          </button>
          <button onClick={download} disabled={reports.length === 0}>
            Download .md
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {reports.length === 0 ? (
        <p className="muted">No bug reports yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} onRemove={remove} />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
