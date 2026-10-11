import { useEffect, useState } from 'react';
import { api, type CrewMe } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import SkillPicker from '../components/SkillPicker';
import NotificationPreferences from '../components/NotificationPreferences';

/**
 * Crew self-service: the first place a crew member can edit anything about their own account
 * (previously everything was admin-only — see routes/crewPortal.ts's PUT /me). Profile basics
 * (phone/skills/notes) are its own crew-scoped endpoint; password change reuses the same
 * role-agnostic /api/auth/me staff accounts already use (see PreferencesPage); notification
 * preferences is the exact same shared component both shells use.
 */
export default function CrewAccountPage() {
  const { user } = useAuth();
  const [me, setMe] = useState<CrewMe | null>(null);
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [notes, setNotes] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.crewPortal.me().then((m) => {
      setMe(m);
      setPhone(m.phone ?? '');
      setSkills(m.skills ?? '');
      setNotes(m.notes ?? '');
    });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await api.crewPortal.updateMe({ phone, skills, notes });
      setMe(updated);
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

  if (!me) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>My account</h1>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Profile</h3>
        <form onSubmit={saveProfile}>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="account-phone">Phone</label>
              <input id="account-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
          </div>
          <SkillPicker value={skills} onChange={setSkills} />
          <div className="field">
            <label htmlFor="account-notes">Notes</label>
            <textarea id="account-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" style={{ marginTop: '0.5rem' }}>
            Save
          </button>
        </form>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Signed in as <strong>{user?.username}</strong>
        </p>
      </div>

      <div className="panel">
        <h3>Change password</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="account-current-password">Current password</label>
            <input
              id="account-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-new-password">New password</label>
            <input
              id="account-new-password"
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

      <div className="panel">
        <h3>Notifications</h3>
        <NotificationPreferences />
      </div>
    </div>
  );
}
