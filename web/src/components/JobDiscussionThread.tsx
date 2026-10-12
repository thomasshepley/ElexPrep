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
  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const list = scope === 'staff' ? api.jobDiscussion.list : api.crewPortal.discussion.list;
  const send = scope === 'staff' ? api.jobDiscussion.send : api.crewPortal.discussion.send;
  const editMessage = scope === 'staff' ? api.jobDiscussion.edit : api.crewPortal.discussion.edit;
  const remove = scope === 'staff' ? api.jobDiscussion.remove : api.crewPortal.discussion.remove;
  // Staff with the moderateDiscussion permission (ADMIN always has it) can remove anyone's
  // message and lock/unlock the thread; crew can only ever edit/remove their own and never
  // see a lock control - see routes/jobDiscussion.ts's and crewPortal.ts's matching
  // server-side checks, which this only mirrors for the UI affordance.
  const canModerate = scope === 'staff' && Boolean(user?.permissions?.moderateDiscussion);

  const refresh = () =>
    list(jobId)
      .then((data) => {
        setMessages(data.messages);
        setLocked(data.locked);
      })
      .catch((e) => setError(e.message));

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

  const startEdit = (m: DiscussionMessage) => {
    setEditingId(m.id);
    setEditDraft(m.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (messageId: string) => {
    if (!editDraft.trim()) return;
    setError(null);
    try {
      const updated = await editMessage(jobId, messageId, editDraft.trim());
      setMessages((prev) => prev?.map((m) => (m.id === messageId ? updated : m)) ?? null);
      cancelEdit();
    } catch (err) {
      setError((err as Error).message);
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

  const toggleLock = async () => {
    setLockBusy(true);
    setError(null);
    try {
      const res = await api.jobDiscussion.setLocked(jobId, !locked);
      setLocked(res.locked);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLockBusy(false);
    }
  };

  const canCompose = !locked || canModerate;

  return (
    <div className="discussion-thread">
      {canModerate && (
        <div className="row discussion-lock-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" disabled={lockBusy} onClick={toggleLock}>
            {locked ? 'Unlock discussion' : 'Lock discussion'}
          </button>
        </div>
      )}
      {locked && (
        <p className="muted discussion-locked-note">
          {canModerate ? 'This discussion is locked - only moderators can post.' : 'This discussion is locked.'}
        </p>
      )}
      <div className="discussion-messages" ref={listRef}>
        {messages === null && <p className="muted">Loading…</p>}
        {messages !== null && messages.length === 0 && <p className="muted">No messages yet - say hello.</p>}
        {messages?.map((m) => {
          const isOwn = m.authorUserId === user?.id;
          const isDeleted = Boolean(m.deletedAt);
          const canDelete = !isDeleted && (isOwn || canModerate);
          const canEdit = !isDeleted && isOwn;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} className={`discussion-message${isOwn ? ' is-own' : ''}${isDeleted ? ' is-deleted' : ''}`}>
              <div className="discussion-message-meta">
                <strong>{m.authorName}</strong>
                <span className="chip chip-role">{m.authorRole}</span>
                <span className="muted">{formatTime(m.createdAt)}</span>
                {m.editedAt && !isDeleted && <span className="muted discussion-message-edited">(edited)</span>}
                {(canEdit || canDelete) && !isEditing && (
                  <span className="discussion-message-actions">
                    {canEdit && (
                      <button type="button" className="secondary" onClick={() => startEdit(m)}>
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="secondary" onClick={() => deleteMessage(m.id)} aria-label="Delete message">
                        Delete
                      </button>
                    )}
                  </span>
                )}
              </div>
              {isEditing ? (
                <form
                  className="row discussion-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(m.id);
                  }}
                >
                  <input
                    aria-label="Edit message"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" disabled={!editDraft.trim()}>
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={cancelEdit}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="discussion-message-body">
                  {isDeleted ? <span className="muted">Message removed by {m.deletedByName ?? 'a moderator'}</span> : m.body}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canCompose ? (
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
      ) : (
        <p className="muted">Only moderators can post while this discussion is locked.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
