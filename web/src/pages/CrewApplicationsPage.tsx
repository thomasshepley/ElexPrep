import { useEffect, useState } from 'react';
import { api, type CrewApplicationDetail, type CrewApplicationSummary } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusChipClass(status: string) {
  if (status === 'APPROVED') return 'chip chip-success';
  if (status === 'REJECTED') return 'chip chip-danger';
  return 'chip chip-neutral';
}

export default function CrewApplicationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [applications, setApplications] = useState<CrewApplicationSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrewApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    api.crewApplications
      .list(filter === 'ALL' ? undefined : filter)
      .then(setApplications)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    setExpandedId(null);
    setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(await api.crewApplications.get(id));
  };

  const reject = async (id: string) => {
    const note = prompt('Rejection note (optional):') ?? '';
    await api.crewApplications.reject(id, note || undefined);
    setExpandedId(null);
    setDetail(null);
    refresh();
  };

  return (
    <div>
      <h1>Crew applications</h1>
      <p className="muted">
        Freelance crew applications submitted from the public <code>/apply</code> page. Approving
        one creates their crew portal login immediately.
      </p>

      <div className="tabs">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'active' : undefined} onClick={() => setFilter(s)}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {applications.length === 0 && <p className="muted">No applications here.</p>}

      {applications.map((a) => (
        <div key={a.id} className="panel card-interactive">
          <div className="row" style={{ justifyContent: 'space-between' }} onClick={() => toggleExpand(a.id)}>
            <div>
              <strong>{a.fullName}</strong>{' '}
              <span className="muted">
                {a.email}
                {a.dayRate ? ` · £${a.dayRate}/day` : ''}
              </span>
            </div>
            <span className={statusChipClass(a.status)}>{a.status}</span>
          </div>

          {expandedId === a.id && detail && (
            <div className="info-card-detail" onClick={(e) => e.stopPropagation()}>
              <p>
                {a.phone && (
                  <>
                    <strong>Phone:</strong> {a.phone}
                    <br />
                  </>
                )}
                {a.skills && (
                  <>
                    <strong>Skills:</strong> {a.skills}
                    <br />
                  </>
                )}
                {a.rightToWork && (
                  <>
                    <strong>Right to work:</strong> {a.rightToWork}
                    <br />
                  </>
                )}
                {a.notes && (
                  <>
                    <strong>Notes:</strong> {a.notes}
                  </>
                )}
              </p>

              {detail.documents.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Documents:</strong>{' '}
                  {isAdmin ? (
                    detail.documents.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 && ', '}
                        <a href={api.crewApplications.documentUrl(a.id, d.id)} target="_blank" rel="noreferrer">
                          {d.originalName}
                        </a>
                      </span>
                    ))
                  ) : (
                    <span className="muted">{detail.documents.length} file(s) — admin-only to view</span>
                  )}
                </div>
              )}

              {a.status === 'PENDING' && (
                <ApproveForm applicationId={a.id} fullName={a.fullName} onDone={refresh} onReject={() => reject(a.id)} />
              )}

              {a.status === 'REJECTED' && a.rejectionNote && (
                <p className="muted">Rejection note: {a.rejectionNote}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ApproveForm({
  applicationId,
  fullName,
  onDone,
  onReject,
}: {
  applicationId: string;
  fullName: string;
  onDone: () => void;
  onReject: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(fullName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showForm) {
    return (
      <div className="row">
        <button onClick={() => setShowForm(true)}>Approve</button>
        <button className="secondary" onClick={onReject}>
          Reject
        </button>
      </div>
    );
  }

  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.crewApplications.approve(applicationId, { username, password, displayName: displayName || undefined });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={approve} className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem' }}>
      <div className="field" style={{ width: '10rem' }}>
        <label htmlFor={`approve-username-${applicationId}`}>Username</label>
        <input
          id={`approve-username-${applicationId}`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="field" style={{ width: '10rem' }}>
        <label htmlFor={`approve-password-${applicationId}`}>Password</label>
        <input
          id={`approve-password-${applicationId}`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />
      </div>
      <div className="field" style={{ width: '12rem' }}>
        <label htmlFor={`approve-display-name-${applicationId}`}>Display name</label>
        <input
          id={`approve-display-name-${applicationId}`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <button type="submit" disabled={busy}>
        Create crew login
      </button>
      <button type="button" className="secondary" onClick={() => setShowForm(false)}>
        Cancel
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
