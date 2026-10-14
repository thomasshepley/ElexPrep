import { SkeletonList, SkeletonRegion } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { api, type OnboardingInvite } from '../api/client';
import { useDialog } from '../components/Dialog';

const STATUS_FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'ALL'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusChipClass(status: string) {
  if (status === 'APPROVED') return 'chip chip-accent';
  if (status === 'COMPLETED') return 'chip chip-success';
  if (status === 'REJECTED') return 'chip chip-danger';
  return 'chip chip-neutral';
}

export default function OnboardingPage() {
  const dialog = useDialog();
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [invitesLoaded, setInvites] = useState<OnboardingInvite[] | null>(null);
  const invites = invitesLoaded ?? [];
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = () =>
    api.onboarding
      .list(filter === 'ALL' ? undefined : filter)
      .then(setInvites)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const approve = async (id: string) => {
    setError(null);
    try {
      await api.onboarding.approve(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const reject = async (id: string) => {
    if (!(await dialog.confirm({ title: 'Reject this onboarding request?', confirmLabel: 'Reject', danger: true }))) return;
    await api.onboarding.reject(id);
    refresh();
  };

  const copyLink = async (invite: OnboardingInvite) => {
    if (!invite.token) return;
    const link = `${window.location.origin}/onboard/complete/${invite.token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard access can be refused (permissions, non-HTTPS) - show the link to copy by hand.
      await dialog.prompt({ title: 'Copy this link', message: "Your browser didn't allow copying automatically.", label: 'Signup link', defaultValue: link, confirmLabel: 'Done' });
      return;
    }
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId((id) => (id === invite.id ? null : id)), 2000);
  };

  return (
    <div>
      <h1>Onboarding</h1>
      <p className="muted">
        For people we already want on the roster - skip the full application. Approving a
        request generates a one-time link for them to set up their own account; copy it and send
        it however you'd like (no email is sent automatically).
      </p>

      <div className="tabs">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'active' : undefined} onClick={() => setFilter(s)}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {invitesLoaded === null && !error && <SkeletonRegion className="panel"><SkeletonList items={3} /></SkeletonRegion>}
      {invitesLoaded !== null && invites.length === 0 && <p className="muted">No requests here.</p>}

      {invites.map((i) => (
        <div key={i.id} className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{i.fullName}</strong>
            <span className={statusChipClass(i.status)}>{i.status}</span>
          </div>
          {i.status === 'PENDING' && (
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <button onClick={() => approve(i.id)}>Approve</button>
              <button className="secondary" onClick={() => reject(i.id)}>
                Reject
              </button>
            </div>
          )}
          {i.status === 'APPROVED' && i.token && (
            <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
              <code className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                /onboard/complete/{i.token}
              </code>
              <button className="secondary" onClick={() => copyLink(i)}>
                {copiedId === i.id ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
