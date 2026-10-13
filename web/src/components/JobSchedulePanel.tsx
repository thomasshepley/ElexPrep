import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { resolveCrewColor } from '@elexprep/shared';
import { api, type JobScheduleItem, type JobCrewAssignment, type JobDay } from '../api/client';
import { dateKey, SingleDayTimeline } from './DayTimeline';
import DayBlocksColumn, { localMidnightIso, useDayBlockActions, type DayBlockView } from './DayBlocksColumn';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './Toast';

// The native datetime-local spinner/scroll-wheel snaps to this step, so picking a time quickly
// moves in 15-minute jumps - typing a value directly (e.g. 09:07) is still unrestricted, so an
// exact, non-aligned time is still just as easy to enter.
const TIME_STEP_SECONDS = 15 * 60;

// A handful of sensible preset colors for schedule entries, rather than a full color-wheel
// picker - quick to pick from, matching the small-fixed-palette convention already used for
// crew swatches (see shared/src/crewColors.ts).
const SCHEDULE_COLOR_PRESETS = ['#E53935', '#8E24AA', '#3949AB', '#1E88E5', '#00897B', '#43A047', '#F9A825', '#EF6C00'];

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 09:00 on the given day key (or today if none selected yet) - the default "Starts" value. */
function nineAmOn(dateKeyStr: string | null): string {
  const d = dateKeyStr ? new Date(`${dateKeyStr}T09:00:00`) : new Date();
  if (!dateKeyStr) d.setHours(9, 0, 0, 0);
  return toDatetimeLocal(d);
}

/** 18:00 on the same calendar day as the given datetime-local value - the default "Ends". */
function sixPmSameDay(datetimeLocal: string): string {
  const d = new Date(datetimeLocal);
  d.setHours(18, 0, 0, 0);
  return toDatetimeLocal(d);
}

export default function JobSchedulePanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<JobScheduleItem[]>([]);
  const [jobDays, setJobDays] = useState<JobDay[]>([]);
  const [roster, setRoster] = useState<JobCrewAssignment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(() => nineAmOn(null));
  const [endsAt, setEndsAt] = useState(() => sixPmSameDay(nineAmOn(null)));
  // Once the user edits Ends directly, stop overwriting it when Starts (or the selected day)
  // changes - only the still-untouched default should track those automatically.
  const [endsAtTouched, setEndsAtTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRosterAssignmentId, setActiveRosterAssignmentId] = useState<string | null>(null);

  const canManageCrew = user?.role === 'ADMIN' || Boolean(user?.permissions?.manageCrewAssignments);
  const canManageDays = user?.role === 'ADMIN';

  const refresh = () => api.jobSchedule.list(jobId).then(setItems).catch((e) => setError(e.message));
  const refreshDays = () => api.jobDays.list(jobId).then(setJobDays).catch((e) => setError(e.message));
  const refreshRoster = () => api.jobCrewAssignments.list(jobId).then(setRoster).catch(() => {});

  useEffect(() => {
    refresh();
    refreshDays();
    refreshRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Merges real JobDay rows with any schedule-item date that doesn't have one yet (see
  // DayBlocksColumn's comment) into one sorted list of day blocks for the overview column.
  const blocks = useMemo<DayBlockView[]>(() => {
    const byDate = new Map<string, DayBlockView>();
    for (const day of jobDays) {
      const key = dateKey(new Date(day.date));
      byDate.set(key, { dateKey: key, day, itemCount: 0 });
    }
    for (const item of items) {
      const key = dateKey(new Date(item.startsAt));
      const existing = byDate.get(key);
      if (existing) existing.itemCount += 1;
      else byDate.set(key, { dateKey: key, day: null, itemCount: 1 });
    }
    return [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [jobDays, items]);

  useEffect(() => {
    if (blocks.length === 0) {
      if (selectedDate !== null) setSelectedDate(null);
      return;
    }
    if (!selectedDate || !blocks.some((b) => b.dateKey === selectedDate)) {
      setSelectedDate(blocks[0].dateKey);
    }
  }, [blocks, selectedDate]);

  // Keeps "Add schedule entry" defaulted to the day currently being looked at - 9am-6pm of
  // that day - so adding an entry while viewing e.g. Thu 16 Oct doesn't default to today.
  useEffect(() => {
    const next = nineAmOn(selectedDate);
    setStartsAt(next);
    setEndsAt(sixPmSameDay(next));
    setEndsAtTouched(false);
  }, [selectedDate]);

  const itemsForSelectedDate = useMemo(
    () => (selectedDate ? items.filter((i) => dateKey(new Date(i.startsAt)) === selectedDate) : []),
    [items, selectedDate]
  );

  const handleStartsChange = (value: string) => {
    setStartsAt(value);
    if (!endsAtTouched && value) setEndsAt(sixPmSameDay(value));
  };

  const handleEndsChange = (value: string) => {
    setEndsAt(value);
    setEndsAtTouched(true);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.jobSchedule.create(jobId, {
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        notes: notes || undefined,
        color: color || undefined,
      });
      setTitle('');
      setNotes('');
      setColor(null);
      const next = nineAmOn(selectedDate);
      setStartsAt(next);
      setEndsAt(sixPmSameDay(next));
      setEndsAtTouched(false);
      refresh();
      showToast(`Added "${title}" to the schedule`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.jobSchedule.remove(jobId, id);
    refresh();
    showToast('Schedule entry removed', 'info');
  };

  const unassignTaskCrew = async (itemId: string, crewRowId: string) => {
    try {
      await api.jobSchedule.unassignCrew(jobId, itemId, crewRowId);
      refresh();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const { addDay, removeDay, unassignCrew } = useDayBlockActions(
    jobId,
    () => {
      refreshDays();
      refreshRoster();
    },
    setSelectedDate
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragStart = (e: DragStartEvent) => {
    setActiveRosterAssignmentId(String(e.active.id).replace(/^roster:/, ''));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveRosterAssignmentId(null);
    const { active, over } = e;
    if (!over) return;
    const assignmentId = String(active.id).replace(/^roster:/, '');
    const overId = String(over.id);
    try {
      if (overId.startsWith('day:')) {
        const targetDateKey = overId.replace(/^day:/, '');
        const block = blocks.find((b) => b.dateKey === targetDateKey);
        if (!block) return;
        let dayId = block.day?.id;
        if (!dayId) {
          const created = await api.jobDays.create(jobId, localMidnightIso(targetDateKey));
          dayId = created.id;
        }
        await api.jobDays.assignCrew(jobId, dayId, assignmentId);
        refreshDays();
      } else if (overId.startsWith('task:')) {
        const scheduleItemId = overId.replace(/^task:/, '');
        const item = items.find((i) => i.id === scheduleItemId);
        if (!item) return;
        const itemDateKey = dateKey(new Date(item.startsAt));
        await api.jobSchedule.assignCrew(jobId, scheduleItemId, assignmentId, localMidnightIso(itemDateKey));
        refresh();
        refreshDays();
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const activeAssignment = roster.find((a) => a.id === activeRosterAssignmentId);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="schedule-split">
        <DayBlocksColumn
          blocks={blocks}
          roster={roster}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          canManageDays={canManageDays}
          canManageCrew={canManageCrew}
          onAddDay={addDay}
          onRemoveDay={removeDay}
          onUnassignCrew={unassignCrew}
        />

        <div className="schedule-hour-view">
          <div className="panel">
            <h3>Add schedule entry</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Not limited to the Current RMS opportunity's own dates - add a Prep entry on an
              earlier day if kit needs building before the hire starts.
            </p>
            <form onSubmit={create} className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.9rem' }}>
              <div className="field" style={{ width: '14rem' }}>
                <label htmlFor="sched-title">Title</label>
                <input id="sched-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Load in / Prep" required />
              </div>
              <div className="field" style={{ width: '13rem' }}>
                <label htmlFor="sched-starts">Starts</label>
                <input
                  id="sched-starts"
                  type="datetime-local"
                  step={TIME_STEP_SECONDS}
                  value={startsAt}
                  onChange={(e) => handleStartsChange(e.target.value)}
                  required
                />
              </div>
              <div className="field" style={{ width: '13rem' }}>
                <label htmlFor="sched-ends">Ends (optional)</label>
                <input
                  id="sched-ends"
                  type="datetime-local"
                  step={TIME_STEP_SECONDS}
                  value={endsAt}
                  onChange={(e) => handleEndsChange(e.target.value)}
                />
              </div>
              <div className="field" style={{ width: '16rem' }}>
                <label htmlFor="sched-notes">Notes</label>
                <input id="sched-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Via loading bay" />
              </div>
              <div className="field" style={{ width: 'auto' }}>
                <label>Color</label>
                <div className="row" style={{ gap: '0.3rem' }}>
                  <button
                    type="button"
                    className="schedule-color-swatch"
                    style={{ background: 'var(--surface-sunken)', border: color === null ? '2px solid var(--accent)' : '1px solid var(--border)' }}
                    onClick={() => setColor(null)}
                    aria-label="Default color"
                    title="Default"
                  />
                  {SCHEDULE_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="schedule-color-swatch"
                      style={{ background: c, border: color === c ? '2px solid var(--content)' : '1px solid var(--border)' }}
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <button type="submit">Add</button>
            </form>
            {error && <p className="error">{error}</p>}
          </div>

          {selectedDate && itemsForSelectedDate.length > 0 ? (
            <>
              <div className="panel">
                <h3>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <SingleDayTimeline
                  items={itemsForSelectedDate}
                  dropTargets
                  canManageCrew={canManageCrew}
                  onUnassignCrew={unassignTaskCrew}
                />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Starts</th>
                    <th>Ends</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itemsForSelectedDate.map((i) => (
                    <tr key={i.id}>
                      <td>{i.title}</td>
                      <td>{new Date(i.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{i.endsAt ? new Date(i.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="muted">{i.notes ?? '-'}</td>
                      <td>
                        <button className="secondary" onClick={() => remove(i.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">
              {selectedDate ? 'No schedule entries for this day yet.' : 'Add a day on the left, or add a schedule entry to get started.'}
            </p>
          )}
        </div>
      </div>
      <DragOverlay>
        {activeAssignment && (
          <div className="day-block-crew-chip">
            <span className="crew-swatch-dot" style={{ background: resolveCrewColor(activeAssignment.crewProfileId, activeAssignment.color) }} />
            {activeAssignment.displayName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
