import type { ReactNode } from 'react';
import type { LoadResult } from '../hooks/useLoad';

/** Standard loading / error / ready rendering for a useLoad result - an error is always shown
 * with a retry, never swallowed into a blank panel. */
export default function LoadState<T>({
  load,
  children,
  loadingText = 'Loading…',
}: {
  load: LoadResult<T>;
  children: (data: T) => ReactNode;
  loadingText?: string;
}) {
  if (load.error && load.data === undefined) {
    return (
      <div className="load-error" role="alert">
        <p className="error" style={{ margin: 0 }}>
          {load.error}
        </p>
        <button type="button" className="secondary" onClick={() => void load.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (load.data === undefined) return <p className="muted">{loadingText}</p>;
  return <>{children(load.data)}</>;
}
