import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth.status().then((s) => setNeedsSetup(s.needsSetup));
  }, []);

  useEffect(() => {
    if (user) navigate(user.role === 'SIGNAGE' ? '/signage' : user.role === 'CREW' ? '/crew' : '/', { replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const authed = needsSetup
        ? await api.auth.setup({ username, password, displayName: displayName || undefined })
        : await api.auth.login({ username, password });
      setUser(authed);
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
          <p>{needsSetup ? 'First run — create the admin account.' : 'Sign in to continue.'}</p>
        </div>
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
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {needsSetup ? 'Create admin account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
