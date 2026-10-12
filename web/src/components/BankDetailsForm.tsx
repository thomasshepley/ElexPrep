import { useId } from 'react';
import type { BankDetails } from '../api/client';

const EMPTY: BankDetails = { accountName: '', sortCode: '', accountNumber: '', bankName: '' };

/**
 * Structured bank details fields - replaces the old "upload a document" slot (see the schema
 * comment on CrewProfile.bankDetailsCiphertext). Returns null to the caller when every field is
 * blank, so an untouched form never sends an empty-but-present bankDetails object.
 */
export default function BankDetailsForm({
  value,
  onChange,
}: {
  value: BankDetails | null;
  onChange: (next: BankDetails | null) => void;
}) {
  const idPrefix = useId();
  const current = value ?? EMPTY;

  const set = (patch: Partial<BankDetails>) => {
    const next = { ...current, ...patch };
    const isEmpty = !next.accountName && !next.sortCode && !next.accountNumber && !next.bankName;
    onChange(isEmpty ? null : next);
  };

  return (
    <div className="field">
      <label>Bank details</label>
      <div className="bank-details-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-name`}>Account holder name</label>
          <input id={`${idPrefix}-name`} value={current.accountName} onChange={(e) => set({ accountName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-bank`}>Bank name (optional)</label>
          <input id={`${idPrefix}-bank`} value={current.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-sort`}>Sort code</label>
          <input id={`${idPrefix}-sort`} placeholder="00-00-00" value={current.sortCode} onChange={(e) => set({ sortCode: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-acct`}>Account number</label>
          <input id={`${idPrefix}-acct`} value={current.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} />
        </div>
      </div>
      <p className="muted" style={{ marginTop: '0.3rem' }}>
        Stored encrypted - only visible to admins reviewing compliance details, and to you.
      </p>
    </div>
  );
}
