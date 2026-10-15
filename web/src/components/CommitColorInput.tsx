import { useEffect, useRef, useState } from 'react';

/** A colour input that previews instantly but only commits (saves) once dragging settles -
 * React's onChange fires on every pointer move over the picker, which was a request per move. */
export default function CommitColorInput({
  value,
  onCommit,
  title,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  title?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState(value);
  const committed = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
    committed.current = value;
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next.toLowerCase() === committed.current.toLowerCase()) return;
    committed.current = next;
    onCommit(next);
  };

  return (
    <input
      type="color"
      value={local}
      title={title}
      aria-label={ariaLabel ?? title}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 450);
      }}
      onBlur={() => commit(local)}
    />
  );
}
