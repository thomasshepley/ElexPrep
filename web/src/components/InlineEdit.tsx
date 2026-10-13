import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A table cell value that reads as plain text and becomes an input when clicked (or focused and
 * Enter pressed). Enter or leaving the field saves, Escape cancels. A brief "Saved" tick or a
 * red outline confirms what happened, so long tables of imported data scan as text rather than a
 * wall of inputs, and the "saves on blur" promise is visible rather than assumed.
 *
 * onSave should throw (or reject) when the save fails; the field then stays marked until the
 * next attempt. Unchanged values are never sent.
 */
export default function InlineEdit({
  value,
  onSave,
  label,
  type = 'text',
  placeholder,
  width,
  min,
}: {
  value: string | number | null | undefined;
  onSave: (value: string) => unknown;
  /** Accessible name, e.g. "Address" - also shown as the empty-value placeholder. */
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
  width?: number;
  min?: number;
}) {
  const current = value == null ? '' : String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const stop = (refocus: boolean) => {
    setEditing(false);
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const commit = async (refocus: boolean) => {
    stop(refocus);
    if (draft === current) return;
    setStatus('saving');
    setError(null);
    try {
      await onSave(draft);
      setStatus('saved');
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('error');
      setError((e as Error)?.message || 'Could not save');
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="inline-edit-input"
        type={type}
        min={min}
        aria-label={label}
        placeholder={placeholder ?? label}
        value={draft}
        style={width ? { width } : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(current);
            stop(true);
          }
        }}
      />
    );
  }

  return (
    <span className="inline-edit">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-edit-value${status === 'error' ? ' is-error' : ''}`}
        style={width ? { minWidth: width } : undefined}
        aria-label={`${label}: ${current || 'empty'} - edit`}
        title={error ?? 'Click to edit'}
        onClick={() => setEditing(true)}
      >
        {current || <span className="inline-edit-empty">{placeholder ?? label}</span>}
      </button>
      {status === 'saving' && <span className="inline-edit-status muted" aria-live="polite">Saving…</span>}
      {status === 'saved' && (
        <span className="inline-edit-status inline-edit-saved" aria-live="polite">
          ✓ Saved
        </span>
      )}
      {status === 'error' && (
        <span className="visually-hidden" role="alert">
          {label} not saved
        </span>
      )}
    </span>
  );
}
