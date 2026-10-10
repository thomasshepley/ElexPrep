/**
 * A small vector chevron that rotates via CSS transform instead of swapping glyphs — used for
 * expand/collapse affordances. Replaces raw Unicode ▲/▼ characters, which were the only
 * icon-like elements in an otherwise fully text-based interface and render inconsistently
 * across platform fonts.
 */
export default function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
