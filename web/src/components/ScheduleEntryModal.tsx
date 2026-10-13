import { useState } from 'react';
import { resolveCrewColor } from '@elexprep/shared';
import type { JobCrewAssignment, JobScheduleItem } from '../api/client';
import Modal from './Modal';
import CrewPicker from './CrewPicker';
import DateTimeInput from './DateTimeInput';
import { formatDayHeading, formatTime, toDatetimeLocal } from '../utils/format';

export const SCHEDULE_COLOR_PRESETS = ['#E53935', '#8E24AA', '#3949AB', '#1E88E5', '#00897B', '#43A047', '#F9A825', '#EF6C00'];

export interface ScheduleEntryPatch {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string;
  color: string | null;
}

/**
 * The popup a schedule block opens: when, where, who and notes. Admins can change any of it,
 * tick crew on or off the entry (the keyboard/tap alternative to dragging), or delete it; crew
 * and other staff just read it.
 */
export default function ScheduleEntryModal({
  item,
  roster,
  editable,
  canManageCrew,
  onClose,
  onSave,
  onToggleCrew,
  onDelete,
}: {
  item: JobScheduleItem;
  roster?: JobCrewAssignment[];
  editable: boolean;
  canManageCrew?: boolean;
  onClose: () => void;
  onSave?: (patch: ScheduleEntryPatch) => Promise<void>;
  onToggleCrew?: (assignment: JobCrewAssignment) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(item.startsAt));
  const [endsAt, setEndsAt] = useState(item.endsAt ? toDatetimeLocal(item.endsAt) : '');
  const [location, setLocation] = useState(item.location ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [color, setColor] = useState<string | null>(item.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = `${formatDayHeading(item.startsAt)}, ${formatTime(item.startsAt)}${item.endsAt ? `–${formatTime(item.endsAt)}` : ''}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        location: location.trim() || null,
        notes: notes.trim(),
        color,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const crewSection = (
    <div className="field">
      <label>Crew on this</label>
      <div className="stack-sm">
      {canManageCrew && roster && onToggleCrew ? (
        <CrewPicker
          label="Crew on this entry"
          people={roster}
          selectedIds={new Set(item.crew.map((c) => c.jobCrewAssignmentId))}
          onToggle={(p) => {
            const a = roster.find((r) => r.id === p.id);
            if (a) onToggleCrew(a);
          }}
        />
      ) : item.crew.length === 0 ? (
        <span className="muted">No one assigned to this yet.</span>
      ) : (
        item.crew.map((c) => (
          <span key={c.id} className="row" style={{ gap: '0.5rem' }}>
            <span className="crew-swatch-dot" style={{ background: resolveCrewColor(c.crewProfileId, c.color) }} />
            {c.displayName} <span className="muted">{c.role}</span>
          </span>
        ))
      )}
      </div>
    </div>
  );

  if (!editable) {
    return (
      <Modal title={item.title} onClose={onClose}>
        <div className="stack">
          <p style={{ margin: 0 }}>{when}</p>
          {item.location && (
            <p style={{ margin: 0 }}>
              <span className="muted">Where: </span>
              {item.location}
            </p>
          )}
          {item.notes && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.notes}</p>}
          {crewSection}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={item.title || 'Schedule entry'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="field">
          <label htmlFor="entry-title">Title</label>
          <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field">
            <label htmlFor="entry-starts">Starts</label>
            <DateTimeInput id="entry-starts" stepMinutes={15} value={startsAt} onChange={setStartsAt} required />
          </div>
          <div className="field">
            <label htmlFor="entry-ends">Ends</label>
            <DateTimeInput id="entry-ends" stepMinutes={15} value={endsAt} onChange={setEndsAt} defaultTime="18:00" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="entry-location">Where</label>
          <input id="entry-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="e.g. Loading bay, Stage left" />
        </div>
        <div className="field">
          <label htmlFor="entry-notes">Notes</label>
          <textarea id="entry-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label>Colour</label>
          <div className="row" style={{ gap: '0.3rem' }}>
            <button
              type="button"
              className="schedule-color-swatch"
              style={{ background: 'var(--surface-sunken)', border: color === null ? '2px solid var(--accent)' : '1px solid var(--border)' }}
              onClick={() => setColor(null)}
              aria-label="Default colour"
              aria-pressed={color === null}
            />
            {SCHEDULE_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className="schedule-color-swatch"
                style={{ background: c, border: color === c ? '2px solid var(--content)' : '1px solid var(--border)' }}
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>
        {crewSection}
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {onDelete ? (
            <button type="button" className="danger" onClick={onDelete}>
              Delete entry
            </button>
          ) : (
            <span />
          )}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" disabled={busy || !title.trim()}>
              Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
