/**
 * A small, consistent-weight icon set (1.6pt stroke, 16x16, currentColor) — matches Chevron.tsx's
 * style so every icon in the app (sidebar nav, dashboard toolbar, the crew job page's cards)
 * shares one visual language rather than mixing glyph styles.
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

export function JobsIcon() {
  return (
    <svg {...common}>
      <rect x="2.2" y="5" width="11.6" height="8" rx="1.4" {...stroke} />
      <path d="M5.6 5V3.8a1.4 1.4 0 0 1 1.4-1.4h2a1.4 1.4 0 0 1 1.4 1.4V5" {...stroke} />
      <path d="M2.2 8.6h11.6" {...stroke} />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="2.1" {...stroke} />
      <path
        d="M8 2.6v1.3M8 12.1v1.3M13.4 8h-1.3M3.9 8H2.6M11.6 4.4l-.9.9M5.3 10.7l-.9.9M11.6 11.6l-.9-.9M5.3 5.3l-.9-.9"
        {...stroke}
      />
    </svg>
  );
}

export function SignageIcon() {
  return (
    <svg {...common}>
      <rect x="2.2" y="3" width="11.6" height="8" rx="1.2" {...stroke} />
      <path d="M6 13.4h4M8 11v2.4" {...stroke} />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...common}>
      <circle cx="7" cy="7" r="4.3" {...stroke} />
      <path d="M13.2 13.2l-2.9-2.9" {...stroke} />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...common}>
      <path d="M8 2.8v10.4M2.8 8h10.4" {...stroke} />
    </svg>
  );
}

export function SignOutIcon() {
  return (
    <svg {...common}>
      <path d="M6.8 2.8H4a1.2 1.2 0 0 0-1.2 1.2v8a1.2 1.2 0 0 0 1.2 1.2h2.8" {...stroke} />
      <path d="M10.6 10.8l2.8-2.8-2.8-2.8M13.2 8H6.4" {...stroke} />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="3" {...stroke} />
      <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7l-1.1-1.1" {...stroke} />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...common}>
      <path d="M13.2 9.9A5.6 5.6 0 0 1 6.1 2.8a5.6 5.6 0 1 0 7.1 7.1Z" {...stroke} />
    </svg>
  );
}
