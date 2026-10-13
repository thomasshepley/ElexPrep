import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import NotificationPreferences from '../components/NotificationPreferences';
import TwoFactorPanel from '../components/TwoFactorPanel';
import PasswordInput from '../components/PasswordInput';
import Avatar from '../components/Avatar';
import FileInput from '../components/FileInput';
import MobileAccountActions from '../components/MobileAccountActions';

export default function PreferencesPage() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  if (!user) return null;

  const uploadAvatar = async (file: File) => {
    setAvatarBusy(true);
    try {
      setUser(await api.auth.uploadAvatar(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      setUser(await api.auth.removeAvatar());
    } finally {
      setAvatarBusy(false);
    }
  };

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
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    try {
      await api.auth.updateMe({ password: newPassword, currentPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMessage('Password changed.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1>My preferences</h1>
      <MobileAccountActions />
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Profile</h3>
        <div className="row" style={{ alignItems: 'center', gap: '0.9rem', marginBottom: '0.9rem' }}>
          <Avatar userId={user.id} displayName={user.displayName} hasAvatar={Boolean(user.avatarPath)} size={56} />
          <div>
            <FileInput accept="image/*" disabled={avatarBusy} onFile={uploadAvatar} label={user.avatarPath ? 'Replace picture' : 'Upload picture'} />
            {user.avatarPath && (
              <button type="button" className="secondary" disabled={avatarBusy} onClick={removeAvatar} style={{ marginLeft: '0.5rem' }}>
                Remove
              </button>
            )}
          </div>
        </div>
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
            <PasswordInput
              id="prefs-current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="prefs-new-password">New password</label>
            <PasswordInput
              id="prefs-new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="prefs-confirm-new-password">Confirm new password</label>
            <PasswordInput
              id="prefs-confirm-new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Change password</button>
        </form>
      </div>

      <div className="panel">
        <h3>Two-factor authentication</h3>
        <TwoFactorPanel />
      </div>

      <div className="panel">
        <h3>Notifications</h3>
        <NotificationPreferences />
      </div>
    </div>
  );
}
