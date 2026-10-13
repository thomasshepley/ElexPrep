import { useEffect, useState } from 'react';
import { api, type CrewMember, type DayRateSource, type JobCrewAssignment } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import WhatsAppButton from './WhatsAppButton';
import { useDialog } from './Dialog';
import { formatMoney } from '../utils/format';

const RATE_SOURCE_LABELS: Record<DayRateSource, string> = {
  override: 'set for this job',
  role: "from their rate card's role rate",
  profile: 'from their crew profile',
  rateCard: 'from their general day rate',
  default: 'portal default rate',
  none: 'no rate set anywhere',
};

/**
 * Who's working this job, in what role, at what rate. Viewing is open to anyone who can see
 * the job; adding/editing/removing needs the delegatable manageCrewAssignments permission
 * (ADMIN always has it) - mirrors the publishJobs pattern already used in Job Settings.
 */
export default function JobCrewPanel({ jobId }: { jobId: string }) {
  const dialog = useDialog();
  const { user } = useAuth();
  const canManage = isAdminRole(user?.role) || Boolean(user?.permissions?.manageCrewAssignments);

  const [assignments, setAssignments] = useState<JobCrewAssignment[]>([]);
  const [roster, setRoster] = useState<CrewMember[]>([]);
  const [crewProfileId, setCrewProfileId] = useState('');
  const [role, setRole] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [days, setDays] = useState('');
  const [zeroRated, setZeroRated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobCrewAssignments.list(jobId).then(setAssignments).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    if (canManage) api.crew.list().then(setRoster).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, canManage]);

  const assignedIds = new Set(assignments.map((a) => a.crewProfileId));
  const available = roster.filter((c) => c.active && !assignedIds.has(c.id));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.jobCrewAssignments.create(jobId, {
        crewProfileId,
        role,
        dayRate: dayRate.replace(/[£,\s]/g, '') || undefined,
        days: days || undefined,
        zeroRated,
      });
      setCrewProfileId('');
      setRole('');
      setDayRate('');
      setDays('');
      setZeroRated(false);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Saved on blur, not per keystroke - a PUT + refresh on every key raced and overwrote typing.
  const updateRole = async (a: JobCrewAssignment, value: string) => {
    if (!value) return refresh();
    await api.jobCrewAssignments.update(jobId, a.id, { role: value }).catch((e) => setError((e as Error).message));
    refresh();
  };

  const updateField = async (a: JobCrewAssignment, data: { dayRate?: string; days?: string; zeroRated?: boolean }) => {
    setError(null);
    await api.jobCrewAssignments.update(jobId, a.id, data).catch((e) => setError((e as Error).message));
    refresh();
  };

  // Blank clears the override so the rate falls back to the crew member's own rates again.
  const updateDayRate = (a: JobCrewAssignment, value: string) => {
    const cleaned = value.replace(/[£,\s]/g, '');
    if (cleaned === (a.dayRate ?? '')) return;
    if (cleaned && !Number.isFinite(Number(cleaned))) {
      setError(`"${value}" isn't a number - enter a day rate like 250`);
      return refresh();
    }
    return updateField(a, { dayRate: cleaned });
  };

  const updateDays = (a: JobCrewAssignment, value: string) => {
    if (value.trim() === (a.days ?? '')) return;
    return updateField(a, { days: value.trim() });
  };

  const updateZeroRated = (a: JobCrewAssignment, value: boolean) => updateField(a, { zeroRated: value });

  const remove = async (a: JobCrewAssignment) => {
    if (!(await dialog.confirm({ title: `Remove ${a.displayName} from this job?`, message: 'Their day and task assignments on this job are removed too.', confirmLabel: 'Remove', danger: true }))) return;
    await api.jobCrewAssignments.remove(jobId, a.id);
    refresh();
  };

  return (
    <div className="panel">
      <h3>Crew</h3>
      {canManage && (
        <>
          <form onSubmit={add}>
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
              <div className="field" style={{ width: '12rem' }}>
                <label htmlFor="assign-crew-member">Crew member</label>
                <select id="assign-crew-member" value={crewProfileId} onChange={(e) => setCrewProfileId(e.target.value)} required>
                  <option value="" disabled>
                    Select…
                  </option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: '11rem' }}>
                <label htmlFor="assign-role">Role</label>
                <input id="assign-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="LD, Rigger…" required />
              </div>
              <div className="field" style={{ width: '9rem' }}>
                <label htmlFor="assign-day-rate">Day rate (£)</label>
                <input id="assign-day-rate" inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="Their usual" />
              </div>
              <div className="field" style={{ width: '6rem' }}>
                <label htmlFor="assign-days">Days</label>
                <input id="assign-days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="1" />
              </div>
              {/* A plain checkbox label rather than an uppercase .field label, which wrapped awkwardly. */}
              <label className="row" style={{ gap: '0.4rem', whiteSpace: 'nowrap', alignSelf: 'center' }} title="Cost this person at zero on the crew margin, whatever their rate">
                <input type="checkbox" checked={zeroRated} onChange={(e) => setZeroRated(e.target.checked)} />
                Zero-rate
              </label>
              <button type="submit" disabled={!crewProfileId}>
                Add to job
              </button>
            </div>
          </form>
          {available.length === 0 && roster.length > 0 && (
            <p className="muted">Every active crew member is already assigned to this job.</p>
          )}
          {roster.length === 0 && (
            <p className="muted">No crew in the roster yet - add some on the Crew settings page.</p>
          )}
          {error && <p className="error">{error}</p>}
        </>
      )}

      {assignments.length > 0 ? (
        <div className="table-scroll">
          <table style={{ marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Day rate</th>
                <th>Days</th>
                <th>Zero-rate</th>
                <th></th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.displayName}
                    {!a.active && <span className="muted"> (inactive)</span>}
                  </td>
                  <td>
                    {canManage ? (
                      <input
                        key={`${a.id}-${a.role}`}
                        defaultValue={a.role}
                        aria-label={`Role for ${a.displayName}`}
                        onBlur={(e) => e.target.value.trim() !== a.role && updateRole(a, e.target.value.trim())}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        style={{ width: '10rem' }}
                      />
                    ) : (
                      <span className="chip chip-role">{a.role}</span>
                    )}
                  </td>
                  <td>
                    {a.zeroRated ? (
                      <span className="muted">Zero-rated</span>
                    ) : canManage ? (
                      <>
                        <input
                          key={`${a.id}-${a.dayRate ?? ''}`}
                          defaultValue={a.dayRate ?? ''}
                          inputMode="decimal"
                          placeholder={a.suggestedDayRate ? String(a.suggestedDayRate) : 'Rate'}
                          aria-label={`Day rate for ${a.displayName}`}
                          style={{ width: '6rem' }}
                          onBlur={(e) => updateDayRate(a, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                          {a.dayRate
                            ? `Override - default would be ${formatMoney(a.suggestedDayRate) || 'unset'}`
                            : `${formatMoney(a.effectiveDayRate) || '£0'} ${RATE_SOURCE_LABELS[a.dayRateSource]}`}
                        </div>
                      </>
                    ) : (
                      formatMoney(a.effectiveDayRate) || '-'
                    )}
                  </td>
                  <td>
                    {a.scheduledDays > 0 ? (
                      <span title="Counted from the days this person is assigned to on the Schedule tab">
                        {a.scheduledDays} <span className="muted">(scheduled)</span>
                      </span>
                    ) : canManage ? (
                      <input
                        key={`${a.id}-${a.days ?? ''}`}
                        defaultValue={a.days ?? ''}
                        placeholder="1"
                        aria-label={`Days for ${a.displayName}`}
                        title="Used until they're assigned to days on the Schedule tab"
                        style={{ width: '3.5rem' }}
                        onBlur={(e) => updateDays(a, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    ) : (
                      a.effectiveDays
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <input type="checkbox" checked={a.zeroRated} onChange={(e) => updateZeroRated(a, e.target.checked)} />
                    ) : (
                      a.zeroRated ? 'Yes' : ''
                    )}
                  </td>
                  <td>
                    <WhatsAppButton phone={a.phone} label="WhatsApp" compact />
                  </td>
                  {canManage && (
                    <td>
                      <button type="button" className="secondary" onClick={() => remove(a)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No crew assigned to this job yet.</p>
      )}
    </div>
  );
}
