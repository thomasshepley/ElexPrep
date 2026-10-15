import { SkeletonPanel } from './Skeleton';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import PasswordInput from './PasswordInput';

/**
 * Self-service TOTP enrollment - any signed-in account (admin, user, signage, crew) can set
 * this up for themselves; nothing here is enforced/required yet (see routes/auth.ts's login
 * flow for where it actually gates sign-in once a user opts in). A setup is only persisted
 * once the user proves they can generate a valid code from it (see /confirm), so an abandoned
 * attempt leaves the account untouched.
 */
export default function TwoFactorPanel() {
  const [status, setStatus] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Enrollment in progress (not yet confirmed/persisted)
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  // Shown exactly once, right after enabling or regenerating
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);

  const [disablePassword, setDisablePassword] = useState('');
  const [regenPassword, setRegenPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = () => api.twoFactor.status().then(setStatus).catch((e) => setError(e.message));

  useEffect(() => {
    loadStatus();
  }, []);

  const startSetup = async () => {
    setError(null);
    setMessage(null);
    setNewBackupCodes(null);
    try {
      const { secret, otpauthUrl } = await api.twoFactor.setup();
      setSetupSecret(secret);
      setQrDataUrl(await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupSecret) return;
    setBusy(true);
    setError(null);
    try {
      const { backupCodes } = await api.twoFactor.confirm({ secret: setupSecret, code: confirmCode });
      setNewBackupCodes(backupCodes);
      setSetupSecret(null);
      setQrDataUrl(null);
      setConfirmCode('');
      await loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancelSetup = () => {
    setSetupSecret(null);
    setQrDataUrl(null);
    setConfirmCode('');
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.twoFactor.disable(disablePassword);
      setDisablePassword('');
      setMessage('Two-factor authentication turned off.');
      await loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { backupCodes } = await api.twoFactor.regenerateBackupCodes(regenPassword);
      setNewBackupCodes(backupCodes);
      setRegenPassword('');
      await loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return error ? <p className="error">Could not load two-factor settings: {error}</p> : <SkeletonPanel lines={3} />;

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {newBackupCodes && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <h4>Save your backup codes</h4>
          <p className="muted">
            Each works once, if you lose access to your authenticator app. They won't be shown again - save them somewhere safe.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.4rem',
              fontFamily: 'monospace',
              fontSize: '1rem',
              margin: '0.75rem 0',
            }}
          >
            {newBackupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <button type="button" className="secondary" onClick={() => setNewBackupCodes(null)}>
            I've saved these
          </button>
        </div>
      )}

      {!status.enabled && !setupSecret && (
        <div>
          <p className="muted">Not enabled. Add an authenticator app (Google Authenticator, Authy, 1Password, etc.) as a second step at sign-in.</p>
          <button type="button" onClick={startSetup}>
            Set up two-factor authentication
          </button>
        </div>
      )}

      {setupSecret && (
        <div>
          <p className="muted">Scan this with your authenticator app, or enter the key manually, then confirm with the code it shows.</p>
          <div className="row" style={{ alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
            {qrDataUrl && <img src={qrDataUrl} alt="Scan with your authenticator app" width={220} height={220} />}
            <div>
              <p className="muted" style={{ marginBottom: '0.25rem' }}>Manual entry key</p>
              <code style={{ wordBreak: 'break-all' }}>{setupSecret}</code>
              <form onSubmit={confirmSetup} style={{ marginTop: '1rem' }}>
                <div className="field" style={{ width: '12rem' }}>
                  <label htmlFor="totp-confirm-code">6-digit code</label>
                  <input
                    id="totp-confirm-code"
                    name="one-time-code"
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={8}
                    autoFocus
                    required
                  />
                </div>
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <button type="submit" disabled={busy}>
                    Confirm &amp; enable
                  </button>
                  <button type="button" className="secondary" onClick={cancelSetup} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {status.enabled && (
        <div>
          <p className="chip chip-success" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
            Enabled
          </p>
          <p className="muted">{status.backupCodesRemaining} backup code{status.backupCodesRemaining === 1 ? '' : 's'} remaining.</p>

          <form onSubmit={regenerate} className="row" style={{ alignItems: 'flex-end', marginTop: '0.5rem' }}>
            <div className="field" style={{ width: '14rem' }}>
              <label htmlFor="totp-regen-password">Current password</label>
              <PasswordInput id="totp-regen-password" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} required />
            </div>
            <button type="submit" className="secondary" disabled={busy}>
              Regenerate backup codes
            </button>
          </form>

          <form onSubmit={disable} className="row" style={{ alignItems: 'flex-end', marginTop: '0.75rem' }}>
            <div className="field" style={{ width: '14rem' }}>
              <label htmlFor="totp-disable-password">Current password</label>
              <PasswordInput id="totp-disable-password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required />
            </div>
            <button type="submit" className="secondary" disabled={busy}>
              Turn off two-factor authentication
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
