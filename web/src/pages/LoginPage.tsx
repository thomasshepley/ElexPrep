import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  // Set by the onboarding page after it creates an account, so the person lands here knowing it
  // worked and with their username already filled in.
  const location = useLocation();
  const createdUsername = (location.state as { accountCreated?: string } | null)?.accountCreated;
  // Where to go after signing in, e.g. the phone scanner page a bay's pairing QR opened. Only a
  // path on this site is accepted, never another origin.
  const nextParam = new URLSearchParams(location.search).get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;
  const [needsSetup, setNeedsSetup] = useState(false);
  const [username, setUsername] = useState(createdUsername ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Set once the password step succeeds for a 2FA-enabled account - switches the form to the
  // code-entry step. Nothing is signed in yet at this point (see routes/auth.ts's /login).
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  useEffect(() => {
    api.auth.status().then((s) => setNeedsSetup(s.needsSetup));
  }, []);

  useEffect(() => {
    if (user) navigate(next ?? (user.role === 'SIGNAGE' ? '/signage' : user.role === 'CREW' ? '/crew' : '/'), { replace: true });
  }, [user, navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const authed = needsSetup
        ? await api.auth.setup({ username, password, displayName: displayName || undefined })
        : await api.auth.login({ username, password });
      if ('requiresTotp' in authed) {
        setPendingToken(authed.pendingToken);
      } else {
        setUser(authed);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingToken) return;
    setBusy(true);
    setError(null);
    try {
      const authed = await api.auth.verifyTotp(
        useBackupCode ? { pendingToken, backupCode: totpCode } : { pendingToken, code: totpCode }
      );
      setUser(authed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (pendingToken) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img className="auth-brand-mark" src="/elex-mark.png" alt="" />
            <h1>ELEX Portal</h1>
            <p>{useBackupCode ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
          </div>
          <form onSubmit={submitTotp}>
            <div className="field">
              <label htmlFor="login-totp">{useBackupCode ? 'Backup code' : 'Authentication code'}</label>
              <input
                id="login-totp"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                autoFocus
                required
                inputMode={useBackupCode ? 'text' : 'numeric'}
                placeholder={useBackupCode ? 'XXXX-XXXX' : '123456'}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              Verify
            </button>
          </form>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setTotpCode('');
                setError(null);
              }}
            >
              {useBackupCode ? 'Use your authenticator app instead' : "Lost your device? Use a backup code"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-brand-mark" src="/elex-mark.png" alt="" />
          <h1>ELEX Portal</h1>
          <p>{needsSetup ? 'First run - create the admin account.' : 'Sign in to continue.'}</p>
        </div>
        {createdUsername && (
          <p className="auth-notice" role="status">
            Your account's been created - sign in with the password you just chose.
          </p>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          {needsSetup && (
            <div className="field">
              <label htmlFor="login-display-name">Display name</label>
              <input
                id="login-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {needsSetup && (
            <div className="field">
              <label htmlFor="login-confirm-password">Confirm password</label>
              <PasswordInput
                id="login-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {needsSetup ? 'Create admin account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
