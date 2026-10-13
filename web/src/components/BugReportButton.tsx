import { useState } from 'react';
import { api } from '../api/client';
import { getRecentActions } from '../bugReport/actionTracker';
import Modal from './Modal';
import { useToast } from './Toast';

/**
 * Sidebar footer button, right under the version badge - files a bug report carrying the
 * current page, basic device info, and a rolling trail of the reporter's last few clicks (see
 * bugReport/actionTracker.ts), plus whatever notes they add here. Reporter identity itself
 * isn't collected here at all - the server fills that in from the signed-in session, never
 * trusting anything the client claims about who's reporting.
 */
export default function BugReportButton() {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.bugReports.submit({
        pageUrl: window.location.href,
        pageTitle: document.title,
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        recentActions: getRecentActions(),
        notes: notes || undefined,
      });
      setOpen(false);
      setNotes('');
      showToast("Thanks - that's been logged");
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="secondary sidebar-bug-report" onClick={() => setOpen(true)}>
        Submit a bug
      </button>
      {open && (
        <Modal title="Submit a bug" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            <p className="muted" style={{ marginTop: 0 }}>
              We'll attach the page you're on and what you just clicked automatically - add
              anything else useful below.
            </p>
            <div className="field">
              <label htmlFor="bug-report-notes">What happened?</label>
              <textarea
                id="bug-report-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional - what did you expect to happen?"
              />
            </div>
            <button type="submit" disabled={busy}>
              Submit
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
