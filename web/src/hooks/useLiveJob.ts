import { useCallback, useEffect, useRef, useState } from 'react';
import { prepStreamUrl, type PrepScan } from '../api/client';

export type LiveState = 'connecting' | 'live' | 'reconnecting';

/**
 * Follows a job's prep (and/or a bay) over Server-Sent Events. `onChange` runs whenever the
 * prep changed somewhere (another screen, a phone, a Current RMS change) - debounced so a burst
 * of scans costs one refresh - and also every `pollMs` as a safety net in case events are lost.
 * `onScan` gets every scan as it happens, for the flash and sound.
 */
export function useLiveJob(opts: {
  jobId: string | null;
  bayToken?: string | null;
  onChange: () => void;
  onScan?: (scan: PrepScan) => void;
  onBay?: (event: 'bay' | 'operator', data: Record<string, unknown>) => void;
  onRmsDiff?: () => void;
  pollMs?: number;
}): LiveState {
  const { jobId, bayToken, pollMs = 30_000 } = opts;
  const [state, setState] = useState<LiveState>('connecting');
  const handlers = useRef(opts);
  handlers.current = opts;
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changed = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => handlers.current.onChange(), 250);
  }, []);

  useEffect(() => {
    if (!jobId && !bayToken) return;
    setState('connecting');
    const source = new EventSource(prepStreamUrl({ jobId, bayToken }), { withCredentials: true });
    source.onopen = () => setState('live');
    source.onerror = () => setState('reconnecting');
    const parse = (e: MessageEvent) => {
      try {
        return JSON.parse(e.data) as Record<string, unknown>;
      } catch {
        return {};
      }
    };
    source.addEventListener('hello', () => {
      setState('live');
      // Anything missed while disconnected.
      changed();
    });
    source.addEventListener('prep', changed);
    source.addEventListener('scan', (e) => handlers.current.onScan?.(parse(e as MessageEvent) as unknown as PrepScan));
    source.addEventListener('rms-diff', () => {
      handlers.current.onRmsDiff?.();
      changed();
    });
    source.addEventListener('bay', (e) => handlers.current.onBay?.('bay', parse(e as MessageEvent)));
    source.addEventListener('operator', (e) => handlers.current.onBay?.('operator', parse(e as MessageEvent)));
    const poll = setInterval(() => handlers.current.onChange(), pollMs);
    return () => {
      source.close();
      clearInterval(poll);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [jobId, bayToken, pollMs, changed]);

  return state;
}
