/**
 * A small, consistent-weight icon set (1.75pt stroke, 16x16, currentColor) for the crew job
 * page's cards — matches Chevron.tsx's style so every icon in the app shares one visual
 * language rather than mixing glyph styles.
 */
const common = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  'aria-hidden': true as const,
};
const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function WhoIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="5.2" r="2.4" {...stroke} />
      <path d="M2.8 13.4c0-2.65 2.33-4.4 5.2-4.4s5.2 1.75 5.2 4.4" {...stroke} />
    </svg>
  );
}

export function WhatIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="2.2" width="10" height="11.6" rx="1.4" {...stroke} />
      <path d="M5.6 5.6h4.8M5.6 8h4.8M5.6 10.4h3" {...stroke} />
    </svg>
  );
}

export function WhenIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.6" {...stroke} />
      <path d="M8 4.8V8l2.4 1.4" {...stroke} />
    </svg>
  );
}

export function WhereIcon() {
  return (
    <svg {...common}>
      <path d="M8 14s4.6-4.3 4.6-7.8A4.6 4.6 0 0 0 3.4 6.2C3.4 9.7 8 14 8 14Z" {...stroke} />
      <circle cx="8" cy="6.2" r="1.6" {...stroke} />
    </svg>
  );
}
