import { useState } from 'react';
import { api } from '../api/client';

/**
 * The lighter-weight intake path for someone we already want on the roster - just a name, no
 * review of a full application. An admin decides whether to approve from the name alone
 * (OnboardingPage), then the invitee completes their own profile via a one-time link
 * (OnboardCompletePage) - see OnboardingInvite's schema comment for the full flow.
 */
export default function OnboardPage() {
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.onboarding.submit(fullName.trim());
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img className="auth-brand-mark" src="/elex-mark.png" alt="" />
            <h1>Thanks, {fullName.split(' ')[0] || 'there'}</h1>
            <p>We'll be in touch once you've been approved - then you'll get a link to finish setting up your account.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-brand-mark" src="/elex-mark.png" alt="" />
          <h1>Join the ELEX crew</h1>
          <p>Already know us? Enter your name and we'll send you a link to set up your account.</p>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="onboard-name">Full name</label>
            <input id="onboard-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || !fullName.trim()}>
            Request to be onboarded
          </button>
        </form>
      </div>
    </div>
  );
}
