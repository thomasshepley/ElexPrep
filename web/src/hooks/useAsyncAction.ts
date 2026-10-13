import { useCallback, useRef, useState } from 'react';
import { useToast } from '../components/Toast';

interface RunOptions {
  /** Toast shown when the action succeeds. */
  success?: string;
}

/**
 * Wraps a mutation with a busy flag and error reporting, so no click handler fails silently: a
 * thrown error becomes an error toast and run() resolves undefined; success can show a toast too.
 */
export function useAsyncAction() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(0);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, options: RunOptions = {}): Promise<T | undefined> => {
      inFlight.current++;
      setBusy(true);
      try {
        const result = await action();
        if (options.success) showToast(options.success, 'success');
        return result;
      } catch (e) {
        showToast((e as Error).message || 'Something went wrong', 'error');
        return undefined;
      } finally {
        inFlight.current--;
        if (inFlight.current === 0) setBusy(false);
      }
    },
    [showToast]
  );

  return { busy, run };
}
