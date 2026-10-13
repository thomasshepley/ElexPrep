import { useEffect, useState } from 'react';
import { api, type CrewMember, type JobCrewAssignment } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import WhatsAppButton from './WhatsAppButton';

/**
 * Who's working this job, in what role, at what rate. Viewing is open to anyone who can see
 * the job; adding/editing/removing needs the delegatable manageCrewAssignments permission
 * (ADMIN always has it) - mirrors the publishJobs pattern already used in Job Settings.
 */
export default function JobCrewPanel({ jobId }: { jobId: string }) {
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
        dayRate: dayRate || undefined,
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

  const updateRole = async (a: JobCrewAssignment, value: string) => {
    await api.jobCrewAssignments.update(jobId, a.id, { role: value });
    refresh();
  };

  const updateDays = async (a: JobCrewAssignment, value: string) => {
    await api.jobCrewAssignments.update(jobId, a.id, { days: value });
    refresh();
  };

  const updateZeroRated = async (a: JobCrewAssignment, value: boolean) => {
    await api.jobCrewAssignments.update(jobId, a.id, { zeroRated: value });
    refresh();
  };

  const remove = async (a: JobCrewAssignment) => {
    if (!confirm(`Remove ${a.displayName} from this job?`)) return;
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
                <label htmlFor="assign-day-rate">Day rate override</label>
                <input id="assign-day-rate" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="Optional" />
              </div>
              <div className="field" style={{ width: '6rem' }}>
                <label htmlFor="assign-days">Days</label>
                <input id="assign-days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="1" />
              </div>
              <div className="field" style={{ width: 'auto' }}>
                <label htmlFor="assign-zero-rated" className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    id="assign-zero-rated"
                    type="checkbox"
                    checked={zeroRated}
                    onChange={(e) => setZeroRated(e.target.checked)}
                  />
                  Zero-rate
                </label>
              </div>
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
                    <input value={a.role} onChange={(e) => updateRole(a, e.target.value)} style={{ width: '10rem' }} />
                  ) : (
                    <span className="chip chip-role">{a.role}</span>
                  )}
                </td>
                <td>{a.zeroRated ? <span className="muted">Zero-rated</span> : a.dayRate ?? a.profileDayRate ?? '-'}</td>
                <td>
                  {canManage ? (
                    <input
                      defaultValue={a.days ?? ''}
                      placeholder="1"
                      style={{ width: '3.5rem' }}
                      onBlur={(e) => updateDays(a, e.target.value)}
                    />
                  ) : (
                    a.days ?? '1'
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
                  <WhatsAppButton phone={a.phone} label="WhatsApp" />
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
      ) : (
        <p className="muted">No crew assigned to this job yet.</p>
      )}
    </div>
  );
}
