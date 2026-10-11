import { useEffect, useState } from 'react';
import { api, type JobScheduleItem } from '../api/client';
import DayTimeline from './DayTimeline';

// The native datetime-local spinner/scroll-wheel snaps to this step, so picking a time quickly
// moves in 15-minute jumps — typing a value directly (e.g. 09:07) is still unrestricted, so an
// exact, non-aligned time is still just as easy to enter.
const TIME_STEP_SECONDS = 15 * 60;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today at 09:00 — the sensible default for a fresh "Starts" field. */
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
  const [items, setItems] = useState<JobScheduleItem[]>([]);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStartsAt);
  const [endsAt, setEndsAt] = useState(() => plusOneHour(defaultStartsAt()));
  // Once the user edits Ends directly, stop overwriting it when Starts changes — only the
  // still-untouched default should track Starts automatically.
  const [endsAtTouched, setEndsAtTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobSchedule.list(jobId).then(setItems).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.jobSchedule.remove(jobId, id);
    refresh();
  };

  return (
    <div>
      <div className="panel">
        <h3>Add schedule entry</h3>
        <form onSubmit={create} className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.9rem' }}>
          <div className="field" style={{ width: '14rem' }}>
            <label htmlFor="sched-title">Title</label>
            <input id="sched-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Load in" required />
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

      {items.length > 0 && (
        <div className="panel">
          <h3>Day timeline</h3>
          <DayTimeline items={items} />
        </div>
      )}

      {items.length > 0 && (
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
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>{new Date(i.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{i.endsAt ? new Date(i.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="muted">{i.notes ?? '—'}</td>
                <td>
                  <button className="secondary" onClick={() => remove(i.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
