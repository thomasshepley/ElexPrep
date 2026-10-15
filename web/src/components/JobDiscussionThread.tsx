import { Skeleton, SkeletonRegion } from './Skeleton';
import { useEffect, useRef, useState } from 'react';
import { api, type DiscussionGroup, type DiscussionGroupInput, type DiscussionMessage, type JobCrewAssignment } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import Modal from './Modal';
import CrewPicker from './CrewPicker';
import { useDialog } from './Dialog';
import { formatDateTime } from '../utils/format';
import UserName from './UserName';

const POLL_MS = 15000;

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

// Same small palette as schedule entries, so group colours sit with the rest of the job's colours.
const GROUP_COLORS = ['#E53935', '#8E24AA', '#3949AB', '#1E88E5', '#00897B', '#43A047', '#F9A825', '#EF6C00'];


/**
 * A flat, chronological message thread for one job - shared by the admin job detail page's
 * Discussion tab and the crew portal job page's Discussion card, parameterized only by which
 * API surface to call (same message model underneath; see routes/jobDiscussion.ts and
 * crewPortal.ts's /me/jobs/:jobId/discussion). Polls like NotificationBell rather than pushing,
 * since this app has no realtime transport yet.
 */
export default function JobDiscussionThread({ jobId, scope }: { jobId: string; scope: 'staff' | 'crew' }) {
  const dialog = useDialog();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DiscussionMessage[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  // null = closed, 'new' = creating, otherwise the group being edited.
  const [editingGroup, setEditingGroup] = useState<DiscussionGroup | 'new' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const groupIdRef = useRef<string | null>(null);
  groupIdRef.current = groupId;

  const list = scope === 'staff' ? api.jobDiscussion.list : api.crewPortal.discussion.list;
  const send = scope === 'staff' ? api.jobDiscussion.send : api.crewPortal.discussion.send;
  const editMessage = scope === 'staff' ? api.jobDiscussion.edit : api.crewPortal.discussion.edit;
  const remove = scope === 'staff' ? api.jobDiscussion.remove : api.crewPortal.discussion.remove;
  const attachmentUrl = scope === 'staff' ? api.jobDiscussion.attachmentUrl : api.crewPortal.discussion.attachmentUrl;
  // Staff with the moderateDiscussion permission (ADMIN always has it) can remove anyone's
  // message and lock/unlock the thread; crew can only ever edit/remove their own and never
  // see a lock control - see routes/jobDiscussion.ts's and crewPortal.ts's matching
  // server-side checks, which this only mirrors for the UI affordance.
  const canModerate = scope === 'staff' && Boolean(user?.permissions?.moderateDiscussion);
  const canManageGroups = scope === 'staff' && isAdminRole(user?.role);

  // Whether the reader is at (or near) the bottom - new messages only pull the view down when
  // they are, so someone scrolled up reading history isn't yanked away every poll.
  const stickToBottom = useRef(true);
  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const refresh = (wanted: string | null = groupIdRef.current) =>
    list(jobId, wanted)
      .then((data) => {
        // A switch of group while this request was in flight wins; drop the stale answer.
        if (wanted !== groupIdRef.current && groupIdRef.current !== null) return;
        // Keep the same array when nothing changed, so a quiet poll doesn't re-render the thread.
        setMessages((prev) => (prev && JSON.stringify(prev) === JSON.stringify(data.messages) ? prev : data.messages));
        setLocked(data.locked);
        setGroups((prev) => (JSON.stringify(prev) === JSON.stringify(data.groups) ? prev : data.groups));
        if (data.groupId !== groupIdRef.current) {
          groupIdRef.current = data.groupId;
          setGroupId(data.groupId);
        }
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    groupIdRef.current = null;
    setGroupId(null);
    refresh(null);
    const timer = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const switchGroup = (id: string) => {
    if (id === groupId) return;
    groupIdRef.current = id;
    setGroupId(id);
    setMessages(null);
    setEditingId(null);
    setReplyTo(null);
    stickToBottom.current = true;
    refresh(id);
  };

  const saveGroup = async (data: DiscussionGroupInput) => {
    if (editingGroup === 'new') {
      const created = await api.jobDiscussion.createGroup(jobId, data);
      setEditingGroup(null);
      switchGroup(created.id);
    } else if (editingGroup) {
      await api.jobDiscussion.updateGroup(jobId, editingGroup.id, data);
      setEditingGroup(null);
      refresh();
    }
  };

  const deleteGroup = async (g: DiscussionGroup) => {
    if (
      !(await dialog.confirm({
        title: `Delete "${g.name}"?`,
        message: `Its ${g.messageCount ?? 0} message${g.messageCount === 1 ? '' : 's'} are deleted with it. This can't be undone.`,
        confirmLabel: 'Delete group',
        danger: true,
        typeToConfirm: g.messageCount ? g.name : undefined,
      }))
    )
      return;
    try {
      await api.jobDiscussion.removeGroup(jobId, g.id);
      setEditingGroup(null);
      const general = groups.find((x) => x.isDefault);
      if (general) switchGroup(general.id);
      else refresh(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const currentGroup = groups.find((g) => g.id === groupId) ?? null;

  useEffect(() => {
    if (listRef.current && stickToBottom.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pickImage = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only images and GIFs can be attached.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That image is over 10 MB.');
      return;
    }
    setError(null);
    setImage(file);
  };

  const startReply = (m: DiscussionMessage) => {
    setReplyTo(m);
    draftRef.current?.focus();
  };

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-highlighted');
    setTimeout(() => el.classList.remove('is-highlighted'), 1600);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() && !image) return;
    setBusy(true);
    setError(null);
    try {
      const message = await send(jobId, { body: draft.trim(), groupId, replyToId: replyTo?.id ?? null, image });
      stickToBottom.current = true;
      setMessages((prev) => [...(prev ?? []), message]);
      setDraft('');
      setReplyTo(null);
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
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

  const saveEdit = async (messageId: string, hasImage: boolean) => {
    if (!editDraft.trim() && !hasImage) return;
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
    if (!(await dialog.confirm({ title: 'Delete this message?', confirmLabel: 'Delete', danger: true }))) return;
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
      <div className="row-between discussion-header">
        <h3 className="mt-0 mb-0">Discussion</h3>
        <div className="row" style={{ gap: '0.5rem' }}>
          {canManageGroups && currentGroup && (
            <button type="button" className="secondary" onClick={() => setEditingGroup(currentGroup)}>
              Edit group
            </button>
          )}
          {canModerate && (
            <button type="button" className="secondary" disabled={lockBusy} onClick={toggleLock}>
              {locked ? 'Unlock discussion' : 'Lock discussion'}
            </button>
          )}
        </div>
      </div>
      {(groups.length > 1 || canManageGroups) && (
        <div className="discussion-groups" role="tablist" aria-label="Chat groups">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === groupId}
              className={`discussion-group-tab${g.id === groupId ? ' active' : ''}`}
              style={{ '--group-color': g.color ?? 'var(--accent)' } as React.CSSProperties}
              onClick={() => switchGroup(g.id)}
            >
              <span className="discussion-group-dot" aria-hidden="true" />
              {g.name}
              {g.visibility === 'MEMBERS' && (
                <span className="muted" title="Only the crew added to this group (and staff) can see it">
                  {' '}
                  · members
                </span>
              )}
            </button>
          ))}
          {canManageGroups && (
            <button type="button" className="discussion-group-tab discussion-group-add" onClick={() => setEditingGroup('new')}>
              + Group
            </button>
          )}
        </div>
      )}
      {editingGroup && (
        <GroupEditor
          jobId={jobId}
          group={editingGroup === 'new' ? null : editingGroup}
          onCancel={() => setEditingGroup(null)}
          onSave={saveGroup}
          onDelete={editingGroup !== 'new' && !editingGroup.isDefault ? () => deleteGroup(editingGroup) : undefined}
        />
      )}
      {locked && (
        <p className="muted discussion-locked-note">
          {canModerate ? 'This discussion is locked - only moderators can post.' : 'This discussion is locked.'}
        </p>
      )}
      <div className="discussion-messages" ref={listRef} onScroll={onScroll} role="log" aria-live="polite">
        {messages === null && (
          <SkeletonRegion label="Loading messages…" className="discussion-skeleton">
            {['58%', '42%', '66%', '38%'].map((w, i) => (
              <Skeleton key={i} w={w} h={i % 2 ? 54 : 70} r={10} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />
            ))}
          </SkeletonRegion>
        )}
        {messages !== null && messages.length === 0 && (
          <p className="muted">No messages in {currentGroup?.name ?? 'this group'} yet - say hello.</p>
        )}
        {messages?.map((m) => {
          const isOwn = m.authorUserId === user?.id;
          const isDeleted = Boolean(m.deletedAt);
          const canDelete = !isDeleted && (isOwn || canModerate);
          const canEdit = !isDeleted && isOwn;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`discussion-message${isOwn ? ' is-own' : ''}${isDeleted ? ' is-deleted' : ''}`}>
              <div className="discussion-message-meta">
                <UserName as="strong" name={m.authorName} role={m.authorRole} isProjectManager={m.authorIsProjectManager} />
                <span className="chip chip-role">{m.authorRole}</span>
                <span className="muted">{formatDateTime(m.createdAt)}</span>
                {m.editedAt && !isDeleted && <span className="muted discussion-message-edited">(edited)</span>}
                {(canEdit || canDelete || (canCompose && !isDeleted)) && !isEditing && (
                  <span className="discussion-message-actions">
                    {canCompose && !isDeleted && (
                      <button type="button" className="secondary" onClick={() => startReply(m)} aria-label={`Reply to ${m.authorName}`}>
                        Reply
                      </button>
                    )}
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
              {m.replyTo && !isDeleted && (
                <button type="button" className="discussion-quote" onClick={() => jumpTo(m.replyTo!.id)} title="Show the original message">
                  <UserName as="strong" name={m.replyTo.authorName} role={m.replyTo.authorRole} isProjectManager={m.replyTo.authorIsProjectManager} showPmChip={false} />
                  <span className="discussion-quote-body">
                    {m.replyTo.deleted ? <em>Message deleted</em> : m.replyTo.body || (m.replyTo.hasImage ? '📷 Photo' : '')}
                  </span>
                </button>
              )}
              {m.attachment && !isDeleted && (
                <a className="discussion-image" href={attachmentUrl(jobId, m.id)} target="_blank" rel="noreferrer">
                  <img src={attachmentUrl(jobId, m.id)} alt={m.attachment.name} loading="lazy" />
                </a>
              )}
              {isEditing ? (
                <form
                  className="row discussion-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(m.id, Boolean(m.attachment));
                  }}
                >
                  <input
                    aria-label="Edit message"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" disabled={!editDraft.trim() && !m.attachment}>
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={cancelEdit}>
                    Cancel
                  </button>
                </form>
              ) : (
                (isDeleted || m.body) && (
                  <div className="discussion-message-body">
                    {isDeleted ? <span className="muted">Message removed by {m.deletedByName ?? 'a moderator'}</span> : m.body}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {canCompose ? (
        <form className="discussion-compose" onSubmit={submit}>
          {(replyTo || imagePreview) && (
            <div className="discussion-compose-extras">
              {replyTo && (
                <div className="discussion-quote is-draft">
                  <span>
                    Replying to <UserName as="strong" name={replyTo.authorName} role={replyTo.authorRole} isProjectManager={replyTo.authorIsProjectManager} showPmChip={false} />
                  </span>
                  <span className="discussion-quote-body">{replyTo.body || (replyTo.attachment ? '📷 Photo' : '')}</span>
                  <button type="button" className="secondary discussion-chip-close" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    ×
                  </button>
                </div>
              )}
              {imagePreview && (
                <div className="discussion-image-draft">
                  <img src={imagePreview} alt="Image to send" />
                  <button
                    type="button"
                    className="secondary discussion-chip-close"
                    onClick={() => {
                      setImage(null);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
          <button type="button" className="secondary discussion-attach" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add an image or GIF" title="Add an image or GIF">
            <ImageIcon />
          </button>
          <textarea
            ref={draftRef}
            onPaste={(e) => {
              const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
              if (file) {
                e.preventDefault();
                pickImage(file);
              }
            }}
            aria-label="Message"
            placeholder={`Message ${currentGroup?.name ?? 'the crew'}… (Enter to send, Shift+Enter for a new line)`}
            rows={Math.min(6, Math.max(1, draft.split('\n').length))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
              if (e.key === 'Escape' && replyTo) setReplyTo(null);
            }}
            disabled={busy}
          />
          <button type="submit" disabled={busy || (!draft.trim() && !image)}>
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

/** Create or edit a chat group: name, colour, and who on the crew can see it. */
function GroupEditor({
  jobId,
  group,
  onCancel,
  onSave,
  onDelete,
}: {
  jobId: string;
  group: DiscussionGroup | null;
  onCancel: () => void;
  onSave: (data: DiscussionGroupInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [visibility, setVisibility] = useState(group?.visibility ?? 'EVERYONE');
  const [members, setMembers] = useState<Set<string>>(new Set(group?.memberAssignmentIds ?? []));
  const [crew, setCrew] = useState<JobCrewAssignment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.jobCrewAssignments.list(jobId).then(setCrew).catch(() => setCrew([]));
  }, [jobId]);

  const toggleMember = (id: string) =>
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), color, visibility, memberAssignmentIds: [...members] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={group ? `Edit "${group.name}"` : 'New chat group'} onClose={onCancel}>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="group-name">Name</label>
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus placeholder="e.g. Riggers" />
        </div>
        <div className="field">
          <label>Colour</label>
          <div className="row" style={{ gap: '0.3rem' }}>
            <button
              type="button"
              className="schedule-color-swatch"
              style={{ background: 'var(--accent)', outline: color === null ? '2px solid var(--content)' : 'none', outlineOffset: 2 }}
              onClick={() => setColor(null)}
              aria-label="Default colour"
              aria-pressed={color === null}
            />
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="schedule-color-swatch"
                style={{ background: c, outline: color === c ? '2px solid var(--content)' : 'none', outlineOffset: 2 }}
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: '0.4rem' }}>
            Who can see it
          </legend>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input type="radio" name="group-visibility" checked={visibility === 'EVERYONE'} onChange={() => setVisibility('EVERYONE')} />
            Everyone on this job&apos;s crew
          </label>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input type="radio" name="group-visibility" checked={visibility === 'MEMBERS'} onChange={() => setVisibility('MEMBERS')} />
            Only crew I add
          </label>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Staff can always see every group.
          </span>
        </fieldset>
        {visibility === 'MEMBERS' && (
          <div className="field">
            <label>Members</label>
            <div className="stack-sm">
            {crew === null ? (
              <span className="muted">Loading crew…</span>
            ) : (
              <CrewPicker label="Group members" people={crew} selectedIds={members} onToggle={(p) => toggleMember(p.id)} />
            )}
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete}>
              Delete group
            </button>
          ) : (
            <span />
          )}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim()}>
              {group ? 'Save' : 'Create group'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
