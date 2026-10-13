import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from './PasswordInput';

/**
 * Full-screen gate rendered instead of the normal app shell whenever the signed-in account
 * has mustChangePassword set (an admin forced it via the server-side CLI's
 * force-password-reset command - see server/src/maintenanceMode.ts-adjacent auth routes).
 * The account can still sign in with its current/temporary password - that's how it got this
 * far - but sees nothing else until it sets a new one. Reuses the same PUT /auth/me endpoint
 * self-service password changes already use; the server clears the flag the moment a new
 * password is actually set, so this just unmounts itself once `setUser` picks that up.
 */
export default function ForcedPasswordChange() {
  const { user, setUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.auth.updateMe({ password: newPassword, currentPassword });
      setUser(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <h1>ELEX Portal</h1>
          <p>An admin has required a new password for {user?.username} before continuing.</p>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="forced-current-password">Current password</label>
            <PasswordInput
              id="forced-current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="forced-new-password">New password</label>
            <PasswordInput
              id="forced-new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="forced-confirm-password">Confirm new password</label>
            <PasswordInput
              id="forced-confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            Set new password
          </button>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="link-button" onClick={logout}>
              Sign out instead
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
