import { SkeletonList, SkeletonRegion } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { api, type OnboardingInvite } from '../api/client';
import { useDialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { formatDate } from '../utils/format';

const STATUS_FILTERS = ['APPROVED', 'PENDING', 'COMPLETED', 'REJECTED', 'ALL'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const FILTER_LABEL: Record<StatusFilter, string> = { APPROVED: 'Links sent', PENDING: 'Requests', COMPLETED: 'Joined', REJECTED: 'Rejected or cancelled', ALL: 'All' };

function statusChip(i: OnboardingInvite) {
  if (i.status === 'APPROVED') return i.expired ? <span className="chip chip-danger">Link expired</span> : <span className="chip chip-accent">Waiting for them</span>;
  if (i.status === 'COMPLETED') return <span className="chip chip-success">Joined</span>;
  if (i.status === 'REJECTED') return <span className="chip chip-danger">{i.direct ? 'Cancelled' : 'Rejected or cancelled'}</span>;
  return <span className="chip chip-neutral">Asked to join</span>;
}

const linkFor = (token: string) => `${window.location.origin}/onboard/complete/${token}`;
const introFor = (i: OnboardingInvite) =>
  `Hi ${i.fullName.split(' ')[0]}, here's your link to join the ELEX crew portal. Your name's filled in: add the rest and choose your login${
    i.expiresAt ? ` (the link works until ${formatDate(i.expiresAt)})` : ''
  }.`;
const messageFor = (i: OnboardingInvite) => `${introFor(i)}\n${linkFor(i.token!)}`;

export default function OnboardingPage() {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>('APPROVED');
  const [invitesLoaded, setInvites] = useState<OnboardingInvite[] | null>(null);
  const invites = invitesLoaded ?? [];
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justMade, setJustMade] = useState<OnboardingInvite | null>(null);

  const refresh = () =>
    api.onboarding
      .list(filter === 'ALL' ? undefined : filter)
      .then(setInvites)
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const invite = await api.onboarding.createLink(name);
      setJustMade(invite);
      setName('');
      if (filter === 'APPROVED' || filter === 'ALL') refresh();
      else setFilter('APPROVED');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const copy = async (invite: OnboardingInvite, what: 'link' | 'message', where: string) => {
    if (!invite.token) return;
    const text = what === 'link' ? linkFor(invite.token) : messageFor(invite);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be refused (permissions, non-HTTPS) - show it to copy by hand.
      await dialog.prompt({ title: 'Copy this', message: "Your browser didn't allow copying automatically.", label: what === 'link' ? 'Sign-up link' : 'Message', defaultValue: text, multiline: what === 'message', confirmLabel: 'Done' });
      return;
    }
    const key = `${where}:${invite.id}:${what}`;
    setCopiedId(key);
    setTimeout(() => setCopiedId((id) => (id === key ? null : id)), 2000);
  };

  const share = async (invite: OnboardingInvite) => {
    if (!invite.token) return;
    try {
      await navigator.share({ title: 'Join the ELEX crew portal', text: introFor(invite), url: linkFor(invite.token) });
    } catch (err) {
      // Closing the share sheet isn't an error worth showing.
      if ((err as Error).name !== 'AbortError') showToast("Couldn't open sharing: copy the message instead", 'error');
    }
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const linkActions = (i: OnboardingInvite, where: string) =>
    i.token ? (
      <div className="onboard-link">
        <code className="onboard-link-url">{linkFor(i.token)}</code>
        <div className="row-actions">
          <button type="button" onClick={() => copy(i, 'message', where)}>
            {copiedId === `${where}:${i.id}:message` ? 'Copied' : 'Copy message'}
          </button>
          <button type="button" className="secondary" onClick={() => copy(i, 'link', where)}>
            {copiedId === `${where}:${i.id}:link` ? 'Copied' : 'Copy link'}
          </button>
          {canShare && (
            <button type="button" className="secondary" onClick={() => share(i)}>
              Share
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div>
      <h1>Onboarding</h1>
      <p className="muted">
        For people we already want on the roster, without the full application. Make them a link: their name is filled in for them, and they add the rest and choose
        their own login. Links work for 30 days; nothing is emailed, so send it however you like.
      </p>

      <section className="panel onboard-create">
        <h2>Send someone a sign-up link</h2>
        <form className="onboard-create-form" onSubmit={create}>
          <label className="field">
            <span className="field-label">Their full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jayden Corcoran" required maxLength={200} autoComplete="off" />
          </label>
          <button type="submit" disabled={creating || !name.trim()}>
            {creating ? 'Making the link…' : 'Make a link'}
          </button>
        </form>
        {justMade && (
          <div className="onboard-made" role="status">
            <p>
              <strong>Link ready for {justMade.fullName}.</strong> It works until {justMade.expiresAt ? formatDate(justMade.expiresAt) : 'it is used'}.
            </p>
            {linkActions(justMade, 'new')}
          </div>
        )}
      </section>

      <div className="tabs">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'active' : undefined} onClick={() => setFilter(s)}>
            {FILTER_LABEL[s]}
          </button>
        ))}
      </div>
      {filter === 'PENDING' && <p className="muted">People who asked to join from the onboarding page. Approving one makes their link.</p>}

      {error && <p className="error">{error}</p>}
      {invitesLoaded === null && !error && (
        <SkeletonRegion className="panel">
          <SkeletonList items={3} />
        </SkeletonRegion>
      )}
      {invitesLoaded !== null && invites.length === 0 && <p className="muted">Nothing here.</p>}

      {invites.map((i) => (
        <div key={i.id} className="panel onboard-row">
          <div className="row" style={{ justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <strong>{i.fullName}</strong>
              <div className="muted onboard-meta">
                {i.direct ? 'Link made directly' : 'Asked to join'} on {formatDate(i.createdAt)}
                {i.status === 'APPROVED' && i.expiresAt ? ` · ${i.expired ? 'expired' : 'works until'} ${formatDate(i.expiresAt)}` : ''}
              </div>
            </div>
            {statusChip(i)}
          </div>
          {i.status === 'PENDING' && (
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <button onClick={() => run(() => api.onboarding.approve(i.id))}>Approve</button>
              <button
                className="secondary"
                onClick={async () => {
                  if (await dialog.confirm({ title: 'Reject this onboarding request?', confirmLabel: 'Reject', danger: true })) void run(() => api.onboarding.reject(i.id));
                }}
              >
                Reject
              </button>
            </div>
          )}
          {i.status === 'APPROVED' && (
            <>
              {!i.expired && linkActions(i, 'list')}
              <div className="row onboard-manage">
                <button type="button" className={i.expired ? '' : 'link-button'} onClick={() => run(() => api.onboarding.renew(i.id))}>
                  {i.expired ? 'Make a new link' : 'Replace the link'}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={async () => {
                    if (await dialog.confirm({ title: `Cancel ${i.fullName}'s link?`, message: 'It stops working straight away.', confirmLabel: 'Cancel the link', danger: true }))
                      void run(() => api.onboarding.cancel(i.id));
                  }}
                >
                  Cancel the link
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
