import { useEffect, useState } from 'react';
import { api, type CrewApplicationDetail, type CrewApplicationSummary } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import BankDetailsReveal from '../components/BankDetailsReveal';
import WhatsAppButton from '../components/WhatsAppButton';
import PasswordInput from '../components/PasswordInput';
import { useDialog } from '../components/Dialog';

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusChipClass(status: string) {
  if (status === 'APPROVED') return 'chip chip-success';
  if (status === 'REJECTED') return 'chip chip-danger';
  return 'chip chip-neutral';
}

export default function CrewApplicationsPage() {
  const dialog = useDialog();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [applications, setApplications] = useState<CrewApplicationSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrewApplicationDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    setSelected(new Set());
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
    const note = await dialog.prompt({ title: 'Reject this application?', label: 'Note (optional)', multiline: true, confirmLabel: 'Reject' });
    if (note === null) return;
    await api.crewApplications.reject(id, note.trim() || undefined);
    setExpandedId(null);
    setDetail(null);
    refresh();
  };

  const toggleSelected = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingIds = applications.filter((a) => a.status === 'PENDING').map((a) => a.id);
  const toggleSelectAll = () => setSelected((prev) => (prev.size === pendingIds.length ? new Set() : new Set(pendingIds)));

  const bulkReject = async () => {
    const note = await dialog.prompt({ title: `Reject ${selected.size} applications?`, label: 'Note (optional)', multiline: true, confirmLabel: 'Reject' });
    if (note === null) return;
    await Promise.all([...selected].map((id) => api.crewApplications.reject(id, note.trim() || undefined)));
    setSelected(new Set());
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

      {pendingIds.length > 0 && (
        <div className="row" style={{ marginBottom: '0.75rem', gap: '0.5rem' }}>
          <label className="row" style={{ gap: '0.3rem' }}>
            <input type="checkbox" checked={selected.size === pendingIds.length} onChange={toggleSelectAll} />
            <span className="muted">Select all pending</span>
          </label>
          {selected.size > 0 && (
            <>
              <span className="muted">{selected.size} selected</span>
              <button className="secondary" onClick={bulkReject}>
                Reject selected
              </button>
            </>
          )}
        </div>
      )}

      {applications.map((a) => (
        <div key={a.id} className="panel card-interactive">
          <div className="row" style={{ justifyContent: 'space-between' }} onClick={() => toggleExpand(a.id)}>
            <div className="row" style={{ gap: '0.6rem' }}>
              {a.status === 'PENDING' && (
                <input
                  type="checkbox"
                  aria-label={`Select ${a.fullName}`}
                  checked={selected.has(a.id)}
                  onChange={() => {}}
                  onClick={(e) => toggleSelected(a.id, e)}
                />
              )}
              <div>
                <strong>{a.fullName}</strong>{' '}
                <span className="muted">
                  {a.email}
                  {a.dayRate ? ` · £${a.dayRate}/day` : ''}
                </span>
              </div>
            </div>
            <span className={statusChipClass(a.status)}>{a.status}</span>
          </div>

          {expandedId === a.id && detail && (
            <div className="info-card-detail" onClick={(e) => e.stopPropagation()}>
              <p>
                {a.phone && (
                  <>
                    <strong>Phone:</strong> {a.phone} <WhatsAppButton phone={a.phone} />
                    <br />
                  </>
                )}
                {a.skills && (
                  <>
                    <strong>Skills:</strong> {a.skills}
                    <br />
                  </>
                )}
                {a.certifications && (
                  <>
                    <strong>Certifications:</strong> {a.certifications}
                    <br />
                  </>
                )}
                {a.rightToWork && (
                  <>
                    <strong>Right to work:</strong> {a.rightToWork}
                    <br />
                  </>
                )}
                {a.gender && (
                  <>
                    <strong>Gender:</strong> {a.gender}
                    <br />
                  </>
                )}
                {a.address && (
                  <>
                    <strong>Address:</strong> {a.address}
                    <br />
                  </>
                )}
                {a.notes && (
                  <>
                    <strong>Notes:</strong> {a.notes}
                  </>
                )}
              </p>

              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Bank details:</strong>{' '}
                <BankDetailsReveal hasBankDetails={a.hasBankDetails} fetchDetails={() => api.crewApplications.bankDetails(a.id)} />
              </div>

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
                    <span className="muted">{detail.documents.length} file(s) - admin-only to view</span>
                  )}
                </div>
              )}

              {a.status === 'PENDING' && (
                <ApproveForm
                  applicationId={a.id}
                  fullName={a.fullName}
                  onDone={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.delete(a.id);
                      return next;
                    });
                    refresh();
                  }}
                  onReject={() => reject(a.id)}
                />
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
  const [confirmPassword, setConfirmPassword] = useState('');
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
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
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
        <PasswordInput
          id={`approve-password-${applicationId}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />
      </div>
      <div className="field" style={{ width: '10rem' }}>
        <label htmlFor={`approve-confirm-password-${applicationId}`}>Confirm password</label>
        <PasswordInput
          id={`approve-confirm-password-${applicationId}`}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
