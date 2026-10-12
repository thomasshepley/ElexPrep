import { useState } from 'react';
import type { BankDetails } from '../api/client';

/**
 * "On file" until clicked - decrypting and displaying bank details is a deliberate, logged
 * action (see the server routes' logActivity calls), not something that renders automatically
 * every time a page loads. fetchDetails is injected so this one component serves the admin
 * (api.crew.bankDetails / api.crewApplications.bankDetails) and crew self-service
 * (api.crewPortal.bankDetails) call sites without knowing which it is.
 */
export default function BankDetailsReveal({ hasBankDetails, fetchDetails }: { hasBankDetails: boolean; fetchDetails: () => Promise<BankDetails> }) {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasBankDetails) return <span className="muted">No bank details on file.</span>;

  if (details) {
    return (
      <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        <strong>{details.accountName}</strong>
        {details.bankName && ` · ${details.bankName}`}
        <br />
        Sort code {details.sortCode} · Account {details.accountNumber}
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
