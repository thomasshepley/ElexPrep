import { useState } from 'react';
import { api } from '../../api/client';
import Modal from '../Modal';
import InlinePdfViewer from '../InlinePdfViewer';

const CONFIRM_WORD = 'CONFIRM';

/**
 * Gates the actual "send to printer" action behind a look-before-you-leap step: shows exactly
 * what's about to print (the same combined-preview PDF the pending queue already builds, via
 * InlinePdfViewer) and requires typing CONFIRM before the button enables - printing wastes
 * physical label stock if it's wrong, unlike the Confirm & download action, which stays a
 * one-click button since nothing physical happens and the result is easy to just not use.
 */
export default function PrintConfirmModal({
  jobId,
  busy,
  onClose,
  onConfirm,
}: {
  jobId: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');

  return (
    <Modal title="Confirm print" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        This is exactly what will print. Check it over, then type {CONFIRM_WORD} below to send it
        to the printer.
      </p>
      <InlinePdfViewer url={api.printQueue.previewUrl(jobId)} title="Print preview" />
      <div className="field" style={{ marginTop: '1rem', maxWidth: '16rem' }}>
        <label htmlFor="print-confirm-input">Type {CONFIRM_WORD} to continue</label>
        <input
          id="print-confirm-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoComplete="off"
        />
      </div>
      <div className="row" style={{ marginTop: '1rem', gap: '0.6rem' }}>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy || typed.trim() !== CONFIRM_WORD}>
          {busy ? 'Sending…' : 'Confirm & send to printer'}
        </button>
      </div>
    </Modal>
  );
}
