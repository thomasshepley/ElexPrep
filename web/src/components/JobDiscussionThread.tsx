import { useEffect, useRef, useState } from 'react';
import { api, type DiscussionMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const POLL_MS = 15000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * A flat, chronological message thread for one job - shared by the admin job detail page's
 * Discussion tab and the crew portal job page's Discussion card, parameterized only by which
 * API surface to call (same message model underneath; see routes/jobDiscussion.ts and
 * crewPortal.ts's /me/jobs/:jobId/discussion). Polls like NotificationBell rather than pushing,
 * since this app has no realtime transport yet.
 */
export default function JobDiscussionThread({ jobId, scope }: { jobId: string; scope: 'staff' | 'crew' }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DiscussionMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const list = scope === 'staff' ? api.jobDiscussion.list : api.crewPortal.discussion.list;
  const send = scope === 'staff' ? api.jobDiscussion.send : api.crewPortal.discussion.send;
  const remove = scope === 'staff' ? api.jobDiscussion.remove : api.crewPortal.discussion.remove;
  // Staff with the moderateDiscussion permission (ADMIN always has it) can remove anyone's
  // message; crew can only ever remove their own - see routes/jobDiscussion.ts's and
  // crewPortal.ts's matching server-side checks, which this only mirrors for the UI affordance.
  const canModerate = scope === 'staff' && Boolean(user?.permissions?.moderateDiscussion);

  const refresh = () => list(jobId).then(setMessages).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const message = await send(jobId, draft.trim());
      setMessages((prev) => [...(prev ?? []), message]);
      setDraft('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      await remove(jobId, messageId);
      setMessages((prev) => prev?.filter((m) => m.id !== messageId) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="discussion-thread">
      <div className="discussion-messages" ref={listRef}>
        {messages === null && <p className="muted">Loading…</p>}
        {messages !== null && messages.length === 0 && <p className="muted">No messages yet - say hello.</p>}
        {messages?.map((m) => {
          const isOwn = m.authorUserId === user?.id;
          const canDelete = isOwn || canModerate;
          return (
            <div key={m.id} className={`discussion-message${isOwn ? ' is-own' : ''}`}>
              <div className="discussion-message-meta">
                <strong>{m.authorName}</strong>
                <span className="chip chip-role">{m.authorRole}</span>
                <span className="muted">{formatTime(m.createdAt)}</span>
                {canDelete && (
                  <button
                    type="button"
                    className="secondary discussion-message-delete"
                    onClick={() => deleteMessage(m.id)}
                    aria-label="Delete message"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="discussion-message-body">{m.body}</div>
            </div>
          );
        })}
      </div>
      <form className="discussion-compose" onSubmit={submit}>
        <input
          aria-label="Message"
          placeholder="Write a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
