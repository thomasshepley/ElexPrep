import type { ReactNode } from 'react';
import type { LoadResult } from '../hooks/useLoad';
import { SkeletonPanel } from './Skeleton';

/** Standard loading / error / ready rendering for a useLoad result - an error is always shown
 * with a retry, never swallowed into a blank panel. */
export default function LoadState<T>({
  load,
  children,
  skeleton = <SkeletonPanel lines={3} />,
}: {
  load: LoadResult<T>;
  children: (data: T) => ReactNode;
  /** What to show while loading - shaped like the content. */
  skeleton?: ReactNode;
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
  if (load.data === undefined) return <>{skeleton}</>;
  return <>{children(load.data)}</>;
}
