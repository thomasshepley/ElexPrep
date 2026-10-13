import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useDialog } from './Dialog';

const NEW_LOCATION = '__new_location__';

/** Location picker for fixtures, cases and labels: every location this job already knows about
 * (global + job location colours, plus whatever fixtures already use) with "New location…"
 * for anything else. Controlled by the saved value, so cancelling the prompt snaps back. */
export default function LocationSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = '-',
  width = '9rem',
  id,
}: {
  id?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  width?: string;
}) {
  const dialog = useDialog();
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      id={id}
      value={value}
      aria-label={ariaLabel}
      style={{ width }}
      onChange={async (e) => {
        if (e.target.value !== NEW_LOCATION) return onChange(e.target.value);
        const typed = await dialog.prompt({ title: 'New location', label: 'Location', placeholder: 'e.g. Stage Left', confirmLabel: 'Use', required: true });
        if (typed?.trim()) onChange(typed.trim());
      }}
    >
      <option value="">{placeholder}</option>
      {all.map((loc) => (
        <option key={loc} value={loc}>
          {loc}
        </option>
      ))}
      <option value={NEW_LOCATION}>New location…</option>
    </select>
  );
}


/**
 * Every location a job already knows about, sorted: global and job location colours plus any
 * extra names in use on the page (fixtures, cases). A failed load just gives a shorter list.
 */
export function useJobLocations(jobId: string, inUse: (string | null | undefined)[] = []): string[] {
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    Promise.all([api.locationColorRules.list().catch(() => []), api.jobLocationColorRules.list(jobId).catch(() => [])]).then(([g, j]) =>
      setKnown([...g, ...j].map((r) => r.location)),
    );
  }, [jobId]);
  const key = inUse.join('\u0000');
  return useMemo(
    () => [...new Set([...known, ...inUse.map((l) => l ?? '')])].filter(Boolean).sort((a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [known, key],
  );
}
