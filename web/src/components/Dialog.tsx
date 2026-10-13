import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** If set, the confirm button stays disabled until this exact text is typed. */
  typeToConfirm?: string;
}

interface PromptOptions {
  title: string;
  message?: ReactNode;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  required?: boolean;
  inputType?: 'text' | 'password' | 'number';
  minLength?: number;
  /** Ask for the value twice (e.g. a new password) and only allow submit when they match. */
  confirmEntry?: boolean;
}

interface AlertOptions {
  title: string;
  message?: ReactNode;
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void };

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves null when cancelled - callers should treat that as "don't proceed". */
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** Promise-based replacements for window.confirm/prompt/alert, rendered as the app's own modal
 * so they're styled, keyboard accessible, and can't be suppressed by the browser. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const current = queue[0] ?? null;

  const push = useCallback((req: Request) => setQueue((q) => [...q, req]), []);
  const finish = useCallback(() => setQueue((q) => q.slice(1)), []);

  const api: DialogApi = {
    confirm: useCallback((options) => new Promise<boolean>((resolve) => push({ kind: 'confirm', options, resolve })), [push]),
    prompt: useCallback((options) => new Promise<string | null>((resolve) => push({ kind: 'prompt', options, resolve })), [push]),
    alert: useCallback((options) => new Promise<void>((resolve) => push({ kind: 'alert', options, resolve })), [push]),
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogView key={queue.length} request={current} onDone={finish} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

function DialogView({ request, onDone }: { request: Request; onDone: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(document.activeElement);
  const [value, setValue] = useState(request.kind === 'prompt' ? request.options.defaultValue ?? '' : '');
  const [repeat, setRepeat] = useState('');

  const cancel = useCallback(() => {
    if (request.kind === 'confirm') request.resolve(false);
    else if (request.kind === 'prompt') request.resolve(null);
    else request.resolve();
    onDone();
  }, [request, onDone]);

  useEffect(() => {
    (inputRef.current ?? confirmRef.current)?.focus();
    const restore = previouslyFocused.current;
    return () => {
      if (restore instanceof HTMLElement) restore.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancel]);

  const { options } = request;
  const prompt = request.kind === 'prompt' ? request.options : null;
  const confirm = request.kind === 'confirm' ? request.options : null;
  const mismatch = Boolean(prompt?.confirmEntry && repeat !== value);
  const blocked =
    mismatch ||
    (prompt?.required && !value.trim()) ||
    (prompt?.minLength !== undefined && value.length < prompt.minLength) ||
    (confirm?.typeToConfirm !== undefined && value !== confirm.typeToConfirm);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (request.kind === 'confirm') request.resolve(true);
    else if (request.kind === 'prompt') request.resolve(value);
    else request.resolve();
    onDone();
  };

  const confirmLabel = request.kind === 'alert' ? 'OK' : request.options.confirmLabel ?? 'OK';

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <form className="modal-panel panel dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h3 id={titleId} style={{ marginTop: 0 }}>
          {options.title}
        </h3>
        {options.message && <div className="dialog-message">{options.message}</div>}
        {prompt && (
          <div className="field">
            <label htmlFor={`${titleId}-input`}>{prompt.label}</label>
            {prompt.multiline ? (
              <textarea
                id={`${titleId}-input`}
                ref={inputRef}
                rows={3}
                value={value}
                placeholder={prompt.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <input
                id={`${titleId}-input`}
                ref={inputRef}
                type={prompt.inputType ?? 'text'}
                value={value}
                placeholder={prompt.placeholder}
                autoComplete={prompt.inputType === 'password' ? 'new-password' : 'off'}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            {prompt.minLength !== undefined && <p className="muted dialog-hint">At least {prompt.minLength} characters.</p>}
          </div>
        )}
        {prompt?.confirmEntry && (
          <div className="field">
            <label htmlFor={`${titleId}-repeat`}>Confirm {prompt.label.toLowerCase()}</label>
            <input
              id={`${titleId}-repeat`}
              type={prompt.inputType ?? 'text'}
              value={repeat}
              autoComplete={prompt.inputType === 'password' ? 'new-password' : 'off'}
              onChange={(e) => setRepeat(e.target.value)}
            />
            {repeat && mismatch && <p className="error dialog-hint">These don&apos;t match yet.</p>}
          </div>
        )}
        {confirm?.typeToConfirm !== undefined && (
          <div className="field">
            <label htmlFor={`${titleId}-confirm`}>
              Type <strong>{confirm.typeToConfirm}</strong> to confirm
            </label>
            <input id={`${titleId}-confirm`} ref={inputRef} value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
        <div className="dialog-actions">
          {request.kind !== 'alert' && (
            <button type="button" className="secondary" onClick={cancel}>
              {confirm?.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button type="submit" ref={confirmRef} className={confirm?.danger ? 'danger' : undefined} disabled={Boolean(blocked)}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
