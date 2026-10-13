import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type AuthedUser, type CrewMember, type Role } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';
import Avatar from '../components/Avatar';
import RowMenu from '../components/RowMenu';
import SkillPicker from '../components/SkillPicker';
import WhatsAppButton from '../components/WhatsAppButton';
import UserName from '../components/UserName';
import { PlusIcon } from '../components/Icons';
import { useDialog } from '../components/Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { CrewDocumentsPanel, DefaultRatePanel, ProfileEditPanel, RateCardPanel } from '../components/people/CrewPanels';
import { RoleBaselinePanel, UserPermissionsPanel } from '../components/people/PermissionPanels';

/** Staff account types an admin can hand out here. CREW logins come from the crew form. */
const STAFF_ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'USER', label: 'Prep' },
  { value: 'SIGNAGE', label: 'Signage screen' },
];

/** Staff who can also be put on jobs (a signage screen never works a shift). */
const CAN_BE_CREW: Role[] = ['ADMIN', 'USER'];

type Filter = 'all' | 'staff' | 'crew';

interface Person {
  user: AuthedUser;
  /** Their crew profile when they can be put on jobs - freelancers always, staff when added. */
  crew: CrewMember | null;
}

/**
 * Every login in one list - staff accounts and freelance crew - so someone who is both an admin
 * and a crew member is one row: their account type, permissions and crew profile side by side.
 */
export default function PeoplePage() {
  const dialog = useDialog();
  const { run } = useAsyncAction();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthedUser[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<'staff' | 'crew' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showBaseline, setShowBaseline] = useState(false);

  const refresh = () =>
    Promise.all([api.users.list(), api.crew.list()])
      .then(([u, c]) => {
        setUsers(u);
        setCrew(c);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const people = useMemo<Person[]>(() => {
    const byUser = new Map(crew.map((c) => [c.userId, c]));
    return users
      .map((user) => ({ user, crew: byUser.get(user.id) ?? null }))
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  }, [users, crew]);

  const q = query.trim().toLowerCase();
  const shown = people.filter((p) => {
    if (filter === 'staff' && p.user.role === 'CREW') return false;
    if (filter === 'crew' && !p.crew) return false;
    if (!q) return true;
    return `${p.user.displayName} ${p.user.username} ${p.crew?.skills ?? ''} ${p.crew?.phone ?? ''}`.toLowerCase().includes(q);
  });
  const counts = {
    all: people.length,
    staff: people.filter((p) => p.user.role !== 'CREW').length,
    crew: people.filter((p) => p.crew).length,
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
    refresh();
  };

  const resetPassword = async ({ user, crew: profile }: Person) => {
    const pw = await dialog.prompt({ title: `Reset ${user.username}'s password`, message: 'They will be signed out everywhere and need the new password to sign back in.', label: 'New password', inputType: 'password', minLength: 8, confirmEntry: true, confirmLabel: 'Set password' });
    if (!pw) return;
    await run<unknown>(() => (user.role === 'CREW' && profile ? api.crew.update(profile.id, { password: pw }) : api.users.update(user.id, { password: pw })), { success: 'Password updated' });
  };

  const addToCrew = (p: Person) => act(() => api.crew.fromAdmin(p.user.id));

  const removeFromCrew = async ({ user, crew: profile }: Person) => {
    if (!profile) return;
    if (!(await dialog.confirm({ title: `Take ${user.displayName} off the crew list?`, message: "They can't be put on jobs any more and their crew profile, rate card and documents are removed. Their login stays.", confirmLabel: 'Remove from crew', danger: true }))) return;
    await act(() => api.crew.remove(profile.id));
  };

  const deleteAccount = async ({ user, crew: profile }: Person) => {
    const message = profile
      ? 'Their login, crew profile and job assignments are removed permanently.'
      : 'Their login is removed permanently.';
    if (!(await dialog.confirm({ title: `Delete ${user.displayName}?`, message, confirmLabel: 'Delete', danger: true }))) return;
    await act(() => (user.role === 'CREW' && profile ? api.crew.remove(profile.id) : api.users.remove(user.id)));
  };

  const hasDetails = (p: Person) => p.user.role === 'USER' || p.crew !== null;
  const done = () => {
    setAdding(null);
    refresh();
  };

  return (
    <div>
      <h1>Users &amp; crew</h1>
      <p className="muted">
        Everyone with a login. Admins manage everything, Prep accounts run prep, and signage
        screens are view-only TVs in the prep bay. Anyone marked as crew can be put on jobs, so an
        admin who also works shifts is one person here, not two.
      </p>

      <div className="row" style={{ gap: '0.5rem', marginBottom: 'var(--space-4)' }}>
        <button type="button" onClick={() => setAdding(adding === 'crew' ? null : 'crew')} aria-expanded={adding === 'crew'}>
          <PlusIcon /> Add crew member
        </button>
        <button type="button" className="secondary" onClick={() => setAdding(adding === 'staff' ? null : 'staff')} aria-expanded={adding === 'staff'}>
          <PlusIcon /> Add staff login
        </button>
      </div>
      {adding === 'crew' && <AddCrewForm onAdded={done} />}
      {adding === 'staff' && <AddStaffForm onAdded={done} />}

      <div className="panel">
        <div className="row people-toolbar">
          <div className="segmented" role="group" aria-label="Show">
            {(['all', 'staff', 'crew'] as const).map((f) => (
              <button key={f} type="button" className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Everyone' : f === 'staff' ? 'Staff' : 'Crew'} <span className="muted">{counts[f]}</span>
              </button>
            ))}
          </div>
          <input type="search" aria-label="Search people" placeholder="Search name, username or skill…" value={query} onChange={(e) => setQuery(e.target.value)} className="people-search" />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="table-scroll">
          <table className="people-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Account</th>
                <th>Crew</th>
                <th>Phone</th>
                <th title="Project manager - their name shows in purple across the site">PM tag</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const { user, crew: profile } = p;
                const isMe = user.id === me?.id;
                const open = expandedId === user.id;
                return (
                  <Fragment key={user.id}>
                    <tr>
                      <td>
                        <div className="row" style={{ gap: '0.5rem', flexWrap: 'nowrap' }}>
                          <Avatar userId={user.id} displayName={user.displayName} hasAvatar={Boolean(user.avatarPath)} size={28} />
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              <UserName name={user.displayName} role={user.role} isProjectManager={user.isProjectManager} showPmChip={false} />
                              {isMe && <span className="muted"> (you)</span>}
                            </div>
                            <span className="muted">{user.username}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {user.role === 'CREW' ? (
                          <span className="chip">Crew login</span>
                        ) : STAFF_ROLES.some((r) => r.value === user.role) ? (
                          <select
                            value={user.role}
                            aria-label={`Account type for ${user.username}`}
                            disabled={isMe}
                            title={isMe ? "You can't change your own account type" : undefined}
                            onChange={(e) => act(() => api.users.update(user.id, { role: e.target.value as Role }))}
                          >
                            {STAFF_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="chip">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
                        )}
                      </td>
                      <td>
                        {profile ? (
                          <div className="row" style={{ gap: '0.4rem', flexWrap: 'nowrap' }}>
                            <label className="switch" title={profile.active ? 'Can be put on new jobs' : "Kept for past jobs, can't be put on new ones"}>
                              <input type="checkbox" checked={profile.active} onChange={() => act(() => api.crew.update(profile.id, { active: !profile.active }))} />
                              <span className="switch-track" />
                              {profile.active ? 'Active' : 'Inactive'}
                            </label>
                            {user.role !== 'CREW' && <span className="chip chip-role">Also crew</span>}
                          </div>
                        ) : CAN_BE_CREW.includes(user.role) ? (
                          <button type="button" className="secondary" onClick={() => addToCrew(p)}>
                            Add to crew
                          </button>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        {profile?.phone ? (
                          <div className="row" style={{ gap: '0.4rem', flexWrap: 'nowrap' }}>
                            {profile.phone}
                            <WhatsAppButton phone={profile.phone} label="WhatsApp" compact />
                          </div>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        {user.role !== 'CREW' && (
                          <input
                            type="checkbox"
                            checked={Boolean(user.isProjectManager)}
                            aria-label={`PM tag for ${user.username}`}
                            onChange={(e) => act(() => api.users.update(user.id, { isProjectManager: e.target.checked }))}
                          />
                        )}
                      </td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                          {hasDetails(p) && (
                            <button className="secondary" aria-expanded={open} onClick={() => setExpandedId(open ? null : user.id)}>
                              {open ? 'Close' : 'Details'}
                            </button>
                          )}
                          <RowMenu
                            label={`More actions for ${user.displayName}`}
                            items={[
                              { label: 'Reset password…', onSelect: () => resetPassword(p) },
                              ...(profile && user.role !== 'CREW' ? [{ label: 'Remove from crew…', onSelect: () => removeFromCrew(p), danger: true }] : []),
                              ...(!isMe ? [{ label: 'Delete account…', onSelect: () => deleteAccount(p), danger: true }] : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="people-details">
                        <td colSpan={6}>
                          <div>
                            {user.role === 'USER' && <UserPermissionsPanel userId={user.id} />}
                            {profile && (
                              <>
                                {user.role !== 'CREW' && <h4 className="people-details-heading">Crew profile</h4>}
                                <ProfileEditPanel crew={profile} onChanged={refresh} />
                                <RateCardPanel crewId={profile.id} />
                                <CrewDocumentsPanel crewId={profile.id} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="muted">{q ? `No one matches "${query}".` : 'No one here yet.'}</p>}
      </div>

      <DefaultRatePanel />

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>What Prep accounts can do</h3>
          <button className="secondary" onClick={() => setShowBaseline((s) => !s)} aria-expanded={showBaseline}>
            {showBaseline ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="muted" style={{ marginBottom: showBaseline ? undefined : 0 }}>
          The starting permissions for every Prep account. Change one person's from their Details.
        </p>
        {showBaseline && <RoleBaselinePanel />}
      </div>
    </div>
  );
}

function AddStaffForm({ onAdded }: { onAdded: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [alsoCrew, setAlsoCrew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      const created = await api.users.create({ username, password, displayName: displayName || undefined, role });
      if (alsoCrew && CAN_BE_CREW.includes(role)) await api.crew.fromAdmin(created.id);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel">
      <h3>Add staff login</h3>
      <form onSubmit={create}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="staff-username">Username</label>
            <input id="staff-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="staff-display-name">Display name</label>
            <input id="staff-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="staff-password">Password</label>
            <PasswordInput id="staff-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="staff-confirm-password">Confirm password</label>
            <PasswordInput id="staff-confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <div className="field" style={{ width: '11rem' }}>
            <label htmlFor="staff-role">Account type</label>
            <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {CAN_BE_CREW.includes(role) && (
          <label className="row" style={{ gap: '0.4rem', margin: '0.6rem 0' }}>
            <input type="checkbox" checked={alsoCrew} onChange={(e) => setAlsoCrew(e.target.checked)} />
            Also works on jobs as crew
          </label>
        )}
        <button type="submit">Add login</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** A freelancer: a crew login plus their profile. Rate card and documents go in their Details. */
function AddCrewForm({ onAdded }: { onAdded: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await api.crew.create({ username, password, displayName: displayName || undefined, phone: phone || undefined, skills: skills || undefined });
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel">
      <h3>Add crew member</h3>
      <form onSubmit={create}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="crew-username">Username</label>
            <input id="crew-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jsmith" required />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="crew-display-name">Display name</label>
            <input id="crew-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jamie Smith" />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="crew-password">Password</label>
            <PasswordInput id="crew-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="crew-confirm-password">Confirm password</label>
            <PasswordInput id="crew-confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <div className="field" style={{ width: '10rem' }}>
            <label htmlFor="crew-phone">Phone</label>
            <input id="crew-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
          </div>
        </div>
        <SkillPicker value={skills} onChange={setSkills} />
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Set their rate card and documents afterwards from their Details.
        </p>
        <button type="submit">Add crew member</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
