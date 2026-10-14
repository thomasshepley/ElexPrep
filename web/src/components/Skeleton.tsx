import type { CSSProperties, ReactNode } from 'react';

/**
 * Placeholder shapes shown while a screen's data loads, sized like the content that replaces
 * them so nothing jumps when it arrives. Each loading region is announced once to screen readers
 * ("Loading…") and the shapes themselves are hidden from them.
 */

type Size = number | string;

const px = (v: Size | undefined) => (typeof v === 'number' ? `${v}px` : v);

/** One bar or block. Widths/heights take px numbers or any CSS length. */
export function Skeleton({ w = '100%', h = 14, r, className, style }: { w?: Size; h?: Size; r?: Size; className?: string; style?: CSSProperties }) {
  return <span className={`skeleton${className ? ` ${className}` : ''}`} aria-hidden="true" style={{ width: px(w), height: px(h), borderRadius: px(r), ...style }} />;
}

/** A word-sized bar that sits inside a line of text (e.g. a count still loading), keeping the
 * line's height so the text around it doesn't move. */
export function SkeletonInline({ w = '6em' }: { w?: Size }) {
  return <span className="skeleton skeleton-inline" aria-hidden="true" style={{ width: px(w) }} />;
}

/** Wraps placeholder shapes so assistive tech hears "Loading…" once instead of nothing. */
export function SkeletonRegion({ children, label = 'Loading…', className, style }: { children: ReactNode; label?: string; className?: string; style?: CSSProperties }) {
  return (
    <div className={`skeleton-region${className ? ` ${className}` : ''}`} role="status" aria-busy="true" style={style}>
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

const LINE_WIDTHS = ['92%', '78%', '85%', '64%', '88%', '70%'];

/** A paragraph's worth of lines. */
export function SkeletonText({ lines = 3, gap = 10 }: { lines?: number; gap?: number }) {
  return (
    <span className="skeleton-stack" style={{ gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i === lines - 1 && lines > 1 ? '55%' : LINE_WIDTHS[i % LINE_WIDTHS.length]} />
      ))}
    </span>
  );
}

/** Table-shaped rows, roughly the height of the app's table rows. */
export function SkeletonRows({ rows = 5, cols = 4, rowHeight = 44 }: { rows?: number; cols?: number; rowHeight?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      <div className="skeleton-row skeleton-row-head" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} w="45%" h={10} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-row" style={{ height: rowHeight, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} w={c === 0 ? '70%' : LINE_WIDTHS[(r + c) % LINE_WIDTHS.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A list of people/items: optional round avatar, a name line and a detail line. */
export function SkeletonList({ items = 4, avatar = false, itemHeight = 52 }: { items?: number; avatar?: boolean; itemHeight?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="skeleton-list-item" style={{ minHeight: itemHeight }}>
          {avatar && <Skeleton w={32} h={32} r="50%" />}
          <span className="skeleton-stack" style={{ gap: 7, flex: 1 }}>
            <Skeleton w={LINE_WIDTHS[i % LINE_WIDTHS.length]} h={13} />
            <Skeleton w="40%" h={10} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A whole panel: heading bar plus text, rows or a list. */
export function SkeletonPanel({
  heading = true,
  lines,
  rows,
  cols,
  list,
  avatar,
  height,
  className,
}: {
  heading?: boolean;
  lines?: number;
  rows?: number;
  cols?: number;
  list?: number;
  avatar?: boolean;
  /** A fixed-height block instead (a calendar, a timeline, a preview). */
  height?: Size;
  className?: string;
}) {
  return (
    <SkeletonRegion className={`panel${className ? ` ${className}` : ''}`}>
      {heading && <Skeleton w="34%" h={20} style={{ marginBottom: 16 }} />}
      {height !== undefined && <Skeleton h={height} r={10} />}
      {lines !== undefined && <SkeletonText lines={lines} />}
      {rows !== undefined && <SkeletonRows rows={rows} cols={cols} />}
      {list !== undefined && <SkeletonList items={list} avatar={avatar} />}
    </SkeletonRegion>
  );
}

/** A full page: title bar, intro line and a couple of panels - the route-loading fallback. */
export function PageSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <SkeletonRegion>
      <Skeleton w="38%" h={34} style={{ marginBottom: 14 }} />
      <Skeleton w="62%" h={14} style={{ marginBottom: 28 }} />
      {Array.from({ length: panels }, (_, i) => (
        <div key={i} className="panel">
          <Skeleton w="30%" h={20} style={{ marginBottom: 16 }} />
          <SkeletonText lines={i === 0 ? 4 : 3} />
        </div>
      ))}
    </SkeletonRegion>
  );
}
