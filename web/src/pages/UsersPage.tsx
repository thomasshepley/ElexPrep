import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AuthedUser, type PermissionKey, type Role } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';
import Avatar from '../components/Avatar';

const ROLES: Role[] = ['ADMIN', 'USER', 'SIGNAGE'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthedUser[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);

  // CREW accounts are real rows from GET /api/users (it's unfiltered), but this page's own
  // role <select> only ever offers ADMIN/USER/SIGNAGE - a CREW row would render a dropdown
  // whose value matches none of its options, which browsers silently resolve to the first
  // option (ADMIN), visually misrepresenting a crew login as an admin one. They're managed on
  // the Crew page instead, so they're filtered out here rather than ever rendering that select.
  const refresh = () =>
    api.users
      .list()
      .then((all) => setUsers(all.filter((u) => u.role !== 'CREW')))
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await api.users.create({ username, password, displayName: displayName || undefined, role });
      setUsername('');
      setDisplayName('');
      setPassword('');
      setConfirmPassword('');
      setRole('USER');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const changeRole = async (u: AuthedUser, newRole: Role) => {
    setError(null);
    try {
      await api.users.update(u.id, { role: newRole });
      refresh();
    } catch (err) {
      setError((err as Error).message);
      refresh();
    }
  };

  const resetPassword = async (u: AuthedUser) => {
    const pw = prompt(`New password for ${u.username}:`);
    if (!pw) return;
    await api.users.update(u.id, { password: pw });
    alert('Password updated');
  };

  const remove = async (u: AuthedUser) => {
    if (!confirm(`Delete user ${u.username}?`)) return;
    setError(null);
    try {
      await api.users.remove(u.id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1>Users</h1>
      <p className="muted">
        ADMIN can manage users and see the activity log. USER can run prep. SIGNAGE is a
        view-only login for prep-bay TV screens. Freelance crew accounts are managed separately
        on the <Link to="/settings/crew">Crew</Link> page.
      </p>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Role permissions baseline</h3>
          <button className="secondary" onClick={() => setShowBaseline((s) => !s)}>
            {showBaseline ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="muted" style={{ marginBottom: showBaseline ? undefined : 0 }}>
          What every USER account can do beyond day-to-day prep, before any per-account override
          below.
        </p>
        {showBaseline && <RoleBaselinePanel />}
      </div>

      <div className="panel">
        <h3>Add user</h3>
        <form className="row" onSubmit={create}>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <PasswordInput
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordInput
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Display name</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td>
                  <div className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
                    <Avatar userId={u.id} displayName={u.displayName} hasAvatar={Boolean(u.avatarPath)} size={24} />
                    {u.username}
                    {u.id === me?.id && <span className="muted"> (you)</span>}
                  </div>
                </td>
                <td>{u.displayName}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="row">
                  {u.role === 'USER' && (
                    <button className="secondary" onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}>
                      Permissions
                    </button>
                  )}
                  <button className="secondary" onClick={() => resetPassword(u)}>
                    Reset password
                  </button>
                  {u.id !== me?.id && (
                    <button className="secondary" onClick={() => remove(u)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
              {expandedId === u.id && u.role === 'USER' && (
                <tr>
                  <td colSpan={4}>
                    <UserPermissionsPanel userId={u.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserPermissionsPanel({ userId }: { userId: string }) {
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [override, setOverride] = useState<Partial<Record<PermissionKey, boolean>> | null>(null);
  const [keys, setKeys] = useState<PermissionKey[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    api.permissions
      .getUser(userId)
      .then((res) => {
        setPermissions(res.permissions);
        setOverride(res.override);
        setKeys(res.keys);
        setLabels(res.labels);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    setError(null);
    try {
      const res = await api.permissions.updateUser(userId, { [key]: value });
      setPermissions(res.permissions);
      setOverride((o) => ({ ...o, [key]: value }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const clearOverride = async () => {
    setError(null);
    try {
      const res = await api.permissions.updateUser(userId, null);
      setPermissions(res.permissions);
      setOverride(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hasOverride = override !== null && Object.keys(override).length > 0;

  return (
    <div style={{ padding: '0.75rem 0' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Permission overrides</strong>
        {hasOverride && (
          <button className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={clearOverride}>
            Clear overrides (revert to role baseline)
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: '0.3rem' }}>
        Starts from the shared USER baseline (the "Role permissions baseline" panel above);
        toggling here overrides it for this account only.
      </p>
      {error && <p className="error">{error}</p>}
      {!permissions && <p className="muted">Loading…</p>}
      {permissions && (
        <table>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{labels[key] ?? key}</td>
                <td style={{ textAlign: 'right' }}>
                  <label className="switch">
                    <input type="checkbox" checked={permissions[key]} onChange={(e) => toggle(key, e.target.checked)} />
                    <span className="switch-track" />
                    {permissions[key] ? 'Allowed' : 'Not allowed'}
                    {override?.[key] !== undefined && <span className="chip chip-role">Overridden</span>}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The shared USER-role baseline (what every USER account can do by default) - formerly its
 * own top-level Settings page; folded in here so permissions live in one "Users" tab, with the
 * per-account override (UserPermissionsPanel, above) right below it as the next layer down. */
function RoleBaselinePanel() {
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [keys, setKeys] = useState<PermissionKey[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.permissions.get().then((res) => {
      setPermissions(res.permissions);
      setKeys(res.keys);
      setLabels(res.labels);
    });
  }, []);

  const toggle = async (key: PermissionKey, value: boolean) => {
    setSaved(false);
    setPermissions((p) => (p ? { ...p, [key]: value } : p));
    const res = await api.permissions.update({ [key]: value });
    setPermissions(res.permissions);
    setSaved(true);
  };

  return (
    <div style={{ paddingTop: '0.5rem' }}>
      {!permissions && <p className="muted">Loading…</p>}
      {permissions && (
        <table>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{labels[key] ?? key}</td>
                <td style={{ textAlign: 'right' }}>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={(e) => toggle(key, e.target.checked)}
                    />
                    <span className="switch-track" />
                    {permissions[key] ? 'Allowed' : 'Not allowed'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {saved && <p className="muted">Saved ✓</p>}
    </div>
  );
}
