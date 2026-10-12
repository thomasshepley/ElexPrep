import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type BankDetails } from '../api/client';
import SkillPicker from '../components/SkillPicker';
import CertificationPicker from '../components/CertificationPicker';
import BankDetailsForm from '../components/BankDetailsForm';
import PasswordInput from '../components/PasswordInput';

/**
 * Where an approved OnboardingInvite's one-time link lands — the invitee fills in their own
 * profile and picks their own username/password, rather than an admin doing it on their
 * behalf (contrast routes/crewApplications.ts's approve flow). No document uploads here;
 * those can be added from the crew portal once the account exists.
 */
export default function OnboardCompletePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ fullName: string; status: string } | null | 'not-found'>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [certifications, setCertifications] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.onboarding.invite
      .get(token)
      .then((i) => {
        setInvite(i);
        setDisplayName(i.fullName);
      })
      .catch(() => setInvite('not-found'));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.onboarding.invite.complete(token, {
        username,
        password,
        displayName: displayName || undefined,
        phone: phone || undefined,
        skills: skills || undefined,
        certifications: certifications || undefined,
        gender: gender || undefined,
        address: address || undefined,
        dayRate: dayRate || undefined,
        notes: notes || undefined,
        bankDetails: bankDetails || undefined,
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (invite === null) return null;

  if (invite === 'not-found') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-mark" />
            <h1>Link not found</h1>
            <p className="muted">This onboarding link isn't valid — it may have expired, already been used, or never been approved.</p>
          </div>
        </div>
      </div>
    );
  }

  if (invite.status === 'COMPLETED') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-mark" />
            <h1>Already set up</h1>
            <p className="muted">
              This account's already been created — <a href="/login">sign in</a> instead.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <h1>Welcome, {invite.fullName.split(' ')[0]}</h1>
          <p>Set up your login and tell us a bit about yourself.</p>
        </div>
        <form onSubmit={submit}>
          <div className="row" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor="onboard-username">Username</label>
              <input id="onboard-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor="onboard-password">Password</label>
              <PasswordInput
                id="onboard-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor="onboard-confirm-password">Confirm password</label>
              <PasswordInput
                id="onboard-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor="onboard-display-name">Display name</label>
              <input id="onboard-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="onboard-phone">Phone</label>
              <input id="onboard-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="onboard-day-rate">Day rate</label>
              <input id="onboard-day-rate" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="250" />
            </div>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="onboard-gender">Gender (optional)</label>
              <input id="onboard-gender" value={gender} onChange={(e) => setGender(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 14rem' }}>
              <label htmlFor="onboard-address">Address</label>
              <input id="onboard-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <SkillPicker value={skills} onChange={setSkills} />
          <BankDetailsForm value={bankDetails} onChange={setBankDetails} />
          <CertificationPicker value={certifications} onChange={setCertifications} />

          <div className="field">
            <label htmlFor="onboard-notes">Anything else?</label>
            <textarea id="onboard-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            Create my account
          </button>
        </form>
      </div>
    </div>
  );
}
