import { useEffect, useState } from 'react';
import type { BankDetails } from '../api/client';

/**
 * "On file" until clicked - decrypting and displaying bank details is a deliberate, logged
 * action (see the server routes' logActivity calls), not something that renders automatically
 * every time a page loads. fetchDetails is injected so this one component serves the admin
 * (api.crew.bankDetails / api.crewApplications.bankDetails) and crew self-service
 * (api.crewPortal.bankDetails) call sites without knowing which it is.
 */
const AUTO_HIDE_MS = 60_000;

export default function BankDetailsReveal({
  hasBankDetails,
  fetchDetails,
  version,
}: {
  hasBankDetails: boolean;
  fetchDetails: () => Promise<BankDetails>;
  /** Changes whenever the stored details may have changed (e.g. after a save), so a revealed
   * copy is hidden instead of showing stale numbers. */
  version?: unknown;
}) {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDetails(null);
  }, [hasBankDetails, version]);

  // Re-hidden after a minute - these shouldn't sit on screen indefinitely.
  useEffect(() => {
    if (!details) return;
    const t = setTimeout(() => setDetails(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [details]);

  if (!hasBankDetails) return <span className="muted">No bank details on file.</span>;

  if (details) {
    return (
      <div className="row" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
        <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          <strong>{details.accountName}</strong>
          {details.bankName && ` · ${details.bankName}`}
          <br />
          Sort code {details.sortCode} · Account {details.accountNumber}
        </div>
        <button type="button" className="secondary" onClick={() => setDetails(null)}>
          Hide
        </button>
      </div>
    );
  }

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      setDetails(await fetchDetails());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className="secondary" onClick={reveal} disabled={busy}>
        {busy ? 'Decrypting…' : 'Show bank details'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
