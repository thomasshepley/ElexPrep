import { Fragment, useEffect, useState } from 'react';
import { api, type CrewMember, type DayRateSource, type JobCrewAssignment, type RoleRate } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import WhatsAppButton from './WhatsAppButton';
import { useDialog } from './Dialog';
import { formatDayHeading, formatMoney } from '../utils/format';
import { roleKeyOf } from '../utils/roles';

const RATE_SOURCE_LABELS: Record<DayRateSource, string> = {
  zero: 'zero-rated',
  override: 'set for this person on this job',
  jobRole: "this job's role rate",
  profile: 'their agreed rate',
  globalRole: 'portal role rate',
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
  const [jobRoleRates, setJobRoleRates] = useState<RoleRate[]>([]);
  const [globalRoleRates, setGlobalRoleRates] = useState<RoleRate[]>([]);
  const [newRole, setNewRole] = useState('');
  const [newRoleRate, setNewRoleRate] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => {
    api.jobCrewAssignments.list(jobId).then(setAssignments).catch((e) => setError(e.message));
    api.jobRoleRates.list(jobId).then(setJobRoleRates).catch(() => {});
  };

  useEffect(() => {
    refresh();
    if (canManage) api.crew.list().then(setRoster).catch(() => {});
    // Portal role rates are admin-only; without them the placeholders just show "-".
    if (isAdminRole(user?.role)) api.globalRoleRates.list().then(setGlobalRoleRates).catch(() => {});
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

  const setJobRoleRate = async (role: string, value: string) => {
    const cleaned = value.replace(/[£,\s]/g, '');
    if (cleaned && !Number.isFinite(Number(cleaned))) {
      setError(`"${value}" isn't a number - enter a day rate like 220`);
      return;
    }
    setError(null);
    await api.jobRoleRates.set(jobId, role, cleaned).catch((e) => setError((e as Error).message));
    refresh();
  };

  const addRoleRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.trim() || !newRoleRate.trim()) return;
    await setJobRoleRate(newRole.trim(), newRoleRate);
    setNewRole('');
    setNewRoleRate('');
  };

  const setSingleDayRate = async (d: JobCrewAssignment['scheduledDayList'][number], value: string) => {
    const cleaned = value.replace(/[£,\s]/g, '');
    if (cleaned === (d.dayRate ?? '')) return;
    if (cleaned && !Number.isFinite(Number(cleaned))) {
      setError(`"${value}" isn't a number`);
      return refresh();
    }
    setError(null);
    await api.jobDays.setCrewDayRate(jobId, d.dayId, d.id, cleaned).catch((e) => setError((e as Error).message));
    refresh();
  };

  const hasOverrides = assignments.some((a) => a.dayRate || a.days);
  const clearOverrides = async () => {
    if (
      !(await dialog.confirm({
        title: 'Use role rates for everyone?',
        message: "Clears every rate and day count typed in for individual people on this job. Costs then come from the job's role rates and the days they're assigned to on the Schedule tab. Per-day rates and zero-rating are kept.",
        confirmLabel: 'Use role rates',
      }))
    )
      return;
    await api.jobCrewAssignments.clearOverrides(jobId).catch((e) => setError((e as Error).message));
    refresh();
  };

  // Every role on this job, plus any role that has a rate here, with the portal rate beside it.
  const globalByKey = new Map(globalRoleRates.map((r) => [roleKeyOf(r.role), r]));
  const jobByKey = new Map(jobRoleRates.map((r) => [roleKeyOf(r.role), r]));
  const roleRows = [...new Map([...jobRoleRates.map((r) => r.role), ...assignments.map((a) => a.role)].map((r) => [roleKeyOf(r), r])).values()].sort((x, y) =>
    x.localeCompare(y)
  );
  const totalCost = assignments.reduce((sum, a) => sum + a.cost, 0);
  const totalDays = assignments.reduce((sum, a) => sum + a.effectiveDays, 0);

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
                <input id="assign-day-rate" inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="Role rate" />
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
        <>
          {canManage && hasOverrides && (
            <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.75rem' }}>
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Some people have a rate or day count typed in for this job, which wins over the role rates and the calendar.
              </span>
              <button type="button" className="secondary" onClick={clearOverrides}>
                Use role rates for everyone
              </button>
            </div>
          )}
          <div className="table-scroll">
            <table style={{ marginTop: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Day rate</th>
                  <th>Days</th>
                  <th>Cost</th>
                  <th>Zero-rate</th>
                  <th></th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
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
                              placeholder={a.inheritedDayRate ? String(a.inheritedDayRate) : 'Rate'}
                              aria-label={`Day rate for ${a.displayName}`}
                              title="Leave blank to use the role rate"
                              style={{ width: '6rem' }}
                              onBlur={(e) => updateDayRate(a, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                              {a.dayRate
                                ? `Set for this person - ${RATE_SOURCE_LABELS[a.inheritedDayRateSource]} is ${formatMoney(a.inheritedDayRate) || 'unset'}`
                                : `${formatMoney(a.effectiveDayRate) || '£0'}, ${RATE_SOURCE_LABELS[a.dayRateSource]}`}
                            </div>
                            {a.suggestedDayRate > 0 && (
                              <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                                Their rate card asks {formatMoney(a.suggestedDayRate)}
                              </div>
                            )}
                          </>
                        ) : (
                          formatMoney(a.effectiveDayRate) || '-'
                        )}
                      </td>
                      <td>
                        {a.scheduledDays > 0 ? (
                          <button
                            type="button"
                            className="link-button"
                            style={{ whiteSpace: 'nowrap' }}
                            aria-expanded={expandedId === a.id}
                            title="Counted from the days this person is on in the Schedule tab - open to set a rate for a single day"
                            onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                          >
                            {a.scheduledDays} from calendar
                          </button>
                        ) : canManage ? (
                          <>
                            <input
                              key={`${a.id}-${a.days ?? ''}`}
                              defaultValue={a.days ?? ''}
                              placeholder="1"
                              aria-label={`Days for ${a.displayName}`}
                              title="Used until they're put on days in the Schedule tab"
                              style={{ width: '3.5rem' }}
                              onBlur={(e) => updateDays(a, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                              Not on the calendar yet
                            </div>
                          </>
                        ) : (
                          a.effectiveDays
                        )}
                      </td>
                      <td>{formatMoney(a.cost) || '£0'}</td>
                      <td>
                        {canManage ? (
                          <input
                            type="checkbox"
                            aria-label={`Zero-rate ${a.displayName}`}
                            checked={a.zeroRated}
                            onChange={(e) => updateZeroRated(a, e.target.checked)}
                          />
                        ) : a.zeroRated ? (
                          'Yes'
                        ) : (
                          ''
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
                    {expandedId === a.id && (
                      <tr>
                        <td colSpan={canManage ? 8 : 7}>
                          <div className="crew-day-rates">
                            <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                              Rate for each day {a.displayName} is on. Leave blank to use {formatMoney(a.effectiveDayRate) || 'their job rate'}.
                            </p>
                            {a.scheduledDayList.map((d) => (
                              <label key={d.id} className="row" style={{ gap: '0.6rem' }}>
                                <span style={{ minWidth: '9rem' }}>{formatDayHeading(d.date)}</span>
                                {canManage ? (
                                  <input
                                    key={`${d.id}-${d.dayRate ?? ''}`}
                                    defaultValue={d.dayRate ?? ''}
                                    inputMode="decimal"
                                    placeholder={String(a.effectiveDayRate || '')}
                                    style={{ width: '6rem' }}
                                    onBlur={(e) => setSingleDayRate(d, e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                  />
                                ) : (
                                  <span>{formatMoney(Number(d.dayRate) || a.effectiveDayRate)}</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td>{totalDays} days</td>
                  <td>
                    <strong>{formatMoney(totalCost) || '£0'}</strong>
                  </td>
                  <td colSpan={canManage ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="muted">No crew assigned to this job yet.</p>
      )}

      {(canManage || jobRoleRates.length > 0) && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.25rem' }}>Role rates on this job</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: 'var(--text-sm)' }}>
            What this job pays per day for each role. Anyone without their own rate above gets this, then their agreed rate, then the portal rate for the role (set on the Crew settings page).
          </p>
          {roleRows.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>This job</th>
                    <th>Portal rate</th>
                    <th>People</th>
                  </tr>
                </thead>
                <tbody>
                  {roleRows.map((role) => {
                    const key = roleKeyOf(role);
                    const jobRate = jobByKey.get(key);
                    const globalRate = globalByKey.get(key);
                    return (
                      <tr key={key}>
                        <td>{role}</td>
                        <td>
                          {canManage ? (
                            <input
                              key={`${key}-${jobRate?.dayRate ?? ''}`}
                              defaultValue={jobRate?.dayRate ?? ''}
                              inputMode="decimal"
                              placeholder={globalRate?.dayRate ?? '-'}
                              aria-label={`Day rate for ${role} on this job`}
                              style={{ width: '6rem' }}
                              onBlur={(e) => e.target.value.trim() !== (jobRate?.dayRate ?? '') && setJobRoleRate(role, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                          ) : (
                            formatMoney(Number(jobRate?.dayRate)) || '-'
                          )}
                        </td>
                        <td className="muted">{globalRate ? formatMoney(Number(globalRate.dayRate)) : '-'}</td>
                        <td className="muted">{assignments.filter((a) => roleKeyOf(a.role) === key).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canManage && (
            <form className="row" style={{ alignItems: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }} onSubmit={addRoleRate}>
              <div className="field" style={{ width: '11rem' }}>
                <label htmlFor="job-role-rate-role">Role</label>
                <input id="job-role-rate-role" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Crew Chief" />
              </div>
              <div className="field" style={{ width: '7rem' }}>
                <label htmlFor="job-role-rate-rate">Day rate (£)</label>
                <input id="job-role-rate-rate" inputMode="decimal" value={newRoleRate} onChange={(e) => setNewRoleRate(e.target.value)} />
              </div>
              <button type="submit" className="secondary" disabled={!newRole.trim() || !newRoleRate.trim()}>
                Add role rate
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
