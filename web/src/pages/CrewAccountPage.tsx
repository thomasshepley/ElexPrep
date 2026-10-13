import { useEffect, useState } from 'react';
import { api, type BankDetails, type CrewMe } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import SkillPicker from '../components/SkillPicker';
import CertificationPicker from '../components/CertificationPicker';
import BankDetailsForm from '../components/BankDetailsForm';
import BankDetailsReveal from '../components/BankDetailsReveal';
import RateCardEditor from '../components/RateCardEditor';
import NotificationPreferences from '../components/NotificationPreferences';
import TwoFactorPanel from '../components/TwoFactorPanel';
import PasswordInput from '../components/PasswordInput';
import Avatar from '../components/Avatar';
import FileInput from '../components/FileInput';
import MobileAccountActions from '../components/MobileAccountActions';

/**
 * Crew self-service: the first place a crew member can edit anything about their own account
 * (previously everything was admin-only - see routes/crewPortal.ts's PUT /me). Profile basics
 * (phone/skills/notes/etc.) are its own crew-scoped endpoint; password change reuses the same
 * role-agnostic /api/auth/me staff accounts already use (see PreferencesPage); notification
 * preferences is the exact same shared component both shells use.
 */
export default function CrewAccountPage() {
  const { user, setUser } = useAuth();
  const [me, setMe] = useState<CrewMe | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [certifications, setCertifications] = useState('');
  const [notes, setNotes] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [otherLinkUrl, setOtherLinkUrl] = useState('');
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.crewPortal.me().then((m) => {
      setMe(m);
      setPhone(m.phone ?? '');
      setSkills(m.skills ?? '');
      setCertifications(m.certifications ?? '');
      setNotes(m.notes ?? '');
      setGender(m.gender ?? '');
      setAddress(m.address ?? '');
      setPronouns(m.pronouns ?? '');
      setInstagramUrl(m.instagramUrl ?? '');
      setFacebookUrl(m.facebookUrl ?? '');
      setOtherLinkUrl(m.otherLinkUrl ?? '');
    });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const updated = await api.crewPortal.updateMe({
        phone,
        skills,
        certifications,
        notes,
        gender,
        address,
        pronouns,
        instagramUrl,
        facebookUrl,
        otherLinkUrl,
        bankDetails: bankDetails ?? undefined,
      });
      setMe(updated);
      setBankDetails(null);
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

  if (!me) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>My account</h1>
      <MobileAccountActions />
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Profile</h3>
        {user && (
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
        )}
        <form onSubmit={saveProfile}>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="account-phone">Phone</label>
              <input id="account-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
            <div className="field" style={{ width: '10rem' }}>
              <label htmlFor="account-pronouns">Pronouns</label>
              <input id="account-pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" />
            </div>
            <div className="field" style={{ width: '10rem' }}>
              <label htmlFor="account-gender">Gender</label>
              <input id="account-gender" value={gender} onChange={(e) => setGender(e.target.value)} />
            </div>
            <div className="field" style={{ width: '16rem' }}>
              <label htmlFor="account-address">Address</label>
              <input id="account-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <SkillPicker value={skills} onChange={setSkills} />

          <div className="row" style={{ flexWrap: 'wrap', gap: '0.9rem' }}>
            <div className="field" style={{ width: '14rem' }}>
              <label htmlFor="account-instagram">Instagram</label>
              <input id="account-instagram" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/…" />
            </div>
            <div className="field" style={{ width: '14rem' }}>
              <label htmlFor="account-facebook">Facebook</label>
              <input id="account-facebook" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/…" />
            </div>
            <div className="field" style={{ width: '14rem' }}>
              <label htmlFor="account-other-link">Other link</label>
              <input id="account-other-link" value={otherLinkUrl} onChange={(e) => setOtherLinkUrl(e.target.value)} placeholder="Portfolio, website, …" />
            </div>
          </div>

          <div className="field">
            <label>Bank details</label>
            <BankDetailsReveal hasBankDetails={me.hasBankDetails} fetchDetails={api.crewPortal.bankDetails} version={me} />
          </div>
          <BankDetailsForm value={bankDetails} onChange={setBankDetails} title="Change bank details" />
          <p className="muted" style={{ marginTop: '-0.5rem' }}>
            Leave blank to keep what's already on file.
          </p>

          <CertificationPicker value={certifications} onChange={setCertifications} />

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
        <h3>Rate card</h3>
        <RateCardEditor />
      </div>

      <div className="panel">
        <h3>Change password</h3>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="account-current-password">Current password</label>
            <PasswordInput
              id="account-current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-new-password">New password</label>
            <PasswordInput
              id="account-new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-confirm-new-password">Confirm new password</label>
            <PasswordInput
              id="account-confirm-new-password"
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
