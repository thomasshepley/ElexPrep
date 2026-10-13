import { useEffect, useMemo, useState } from 'react';
import { api, type JobScheduleItem, type JobCrewAssignment, type JobDay } from '../api/client';
import { dateKey, SingleDayTimeline } from './DayTimeline';
import DayBlocksColumn, { type DayBlockView } from './DayBlocksColumn';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './Toast';

// The native datetime-local spinner/scroll-wheel snaps to this step, so picking a time quickly
// moves in 15-minute jumps - typing a value directly (e.g. 09:07) is still unrestricted, so an
// exact, non-aligned time is still just as easy to enter.
const TIME_STEP_SECONDS = 15 * 60;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today at 09:00 - the sensible default for a fresh "Starts" field. */
function defaultStartsAt(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocal(d);
}

/** One hour after the given datetime-local value, same day unless that rolls into the next one. */
function plusOneHour(datetimeLocal: string): string {
  const d = new Date(datetimeLocal);
  d.setHours(d.getHours() + 1);
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
  const [startsAt, setStartsAt] = useState(defaultStartsAt);
  const [endsAt, setEndsAt] = useState(() => plusOneHour(defaultStartsAt()));
  // Once the user edits Ends directly, stop overwriting it when Starts changes - only the
  // still-untouched default should track Starts automatically.
  const [endsAtTouched, setEndsAtTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const itemsForSelectedDate = useMemo(
    () => (selectedDate ? items.filter((i) => dateKey(new Date(i.startsAt)) === selectedDate) : []),
    [items, selectedDate]
  );

  const handleStartsChange = (value: string) => {
    setStartsAt(value);
    if (!endsAtTouched && value) setEndsAt(plusOneHour(value));
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
      });
      setTitle('');
      const next = defaultStartsAt();
      setStartsAt(next);
      setEndsAt(plusOneHour(next));
      setEndsAtTouched(false);
      setNotes('');
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

  return (
    <div className="schedule-split">
      <DayBlocksColumn
        jobId={jobId}
        blocks={blocks}
        roster={roster}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        canManageDays={canManageDays}
        canManageCrew={canManageCrew}
        onChanged={() => {
          refreshDays();
          refreshRoster();
        }}
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
            <button type="submit">Add</button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>

        {selectedDate && itemsForSelectedDate.length > 0 ? (
          <>
            <div className="panel">
              <h3>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              <SingleDayTimeline items={itemsForSelectedDate} />
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
  );
}
