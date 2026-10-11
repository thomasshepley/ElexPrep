import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function PreferencesPage() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await api.auth.updateMe({ displayName });
      setUser(updated);
      setMessage('Profile saved.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.auth.updateMe({ password: newPassword, currentPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1>My preferences</h1>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Profile</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={saveProfile}>
          <div className="field">
            <label htmlFor="prefs-display-name">Display name</label>
            <input id="prefs-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <button type="submit">Save</button>
        </form>
        <p className="muted">
          Signed in as <strong>{user.username}</strong> ({user.role})
        </p>
      </div>

      <div className="panel">
        <h3>Change password</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="prefs-current-password">Current password</label>
            <input
              id="prefs-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="prefs-new-password">New password</label>
            <input
              id="prefs-new-password"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Change password</button>
        </form>
      </div>
    </div>
  );
}
