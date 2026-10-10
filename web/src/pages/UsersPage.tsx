import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AuthedUser, type Role } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const ROLES: Role[] = ['ADMIN', 'USER', 'SIGNAGE'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthedUser[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [error, setError] = useState<string | null>(null);

  // CREW accounts are real rows from GET /api/users (it's unfiltered), but this page's own
  // role <select> only ever offers ADMIN/USER/SIGNAGE — a CREW row would render a dropdown
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
    try {
      await api.users.create({ username, password, displayName: displayName || undefined, role });
      setUsername('');
      setDisplayName('');
      setPassword('');
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
        <h3>Add user</h3>
        <form className="row" onSubmit={create}>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            <tr key={u.id}>
              <td>
                {u.username}
                {u.id === me?.id && <span className="muted"> (you)</span>}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
