import { useEffect, useRef } from 'react';

/**
 * Listens for a USB or Bluetooth barcode scanner acting as a keyboard ("keyboard wedge"),
 * wherever focus is. A scanner types a whole code in a burst then presses Enter (or Tab); a
 * person can't type that fast, so a burst of at least `minLength` characters, each within
 * `maxGapMs` of the last, ending in the suffix key, counts as a scan.
 *
 * With a prefix set (configured on the scanner and in Settings > Prep bays), everything from the
 * prefix to the suffix is a scan regardless of speed and is kept out of any text field.
 */
export function useScannerInput(opts: {
  onScan: (code: string) => void;
  prefix?: string;
  suffix?: 'Enter' | 'Tab';
  enabled?: boolean;
  minLength?: number;
  maxGapMs?: number;
}) {
  const { prefix = '', suffix = 'Enter', enabled = true, minLength = 4, maxGapMs = 45 } = opts;
  const onScan = useRef(opts.onScan);
  onScan.current = opts.onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    let capturing = false;
    let prefixMatched = 0;
    let fast = true;

    const reset = () => {
      buffer = '';
      capturing = false;
      prefixMatched = 0;
      fast = true;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Without a prefix, typing in a text field (the sign-in form) is never a scan.
      const t = e.target as HTMLElement | null;
      if (!prefix && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const now = performance.now();
      const gap = now - last;
      last = now;

      if (e.key === suffix) {
        const code = buffer;
        const wasCapturing = capturing;
        const wasFast = fast;
        reset();
        if ((prefix ? wasCapturing : wasFast) && code.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScan.current(code);
        }
        return;
      }
      if (e.key.length !== 1) return;

      if (prefix) {
        if (!capturing) {
          if (e.key === prefix[prefixMatched]) {
            prefixMatched++;
            e.preventDefault();
            if (prefixMatched === prefix.length) {
              capturing = true;
              buffer = '';
            }
          } else prefixMatched = 0;
          return;
        }
        e.preventDefault();
        buffer += e.key;
        return;
      }

      // No prefix: tell a scanner from typing by speed. A slow gap starts a new candidate.
      if (gap > maxGapMs || buffer === '') {
        buffer = e.key;
        fast = true;
        return;
      }
      buffer += e.key;
    };
    // Capture phase, so the scan is handled before any focused control sees the Enter.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, prefix, suffix, minLength, maxGapMs]);
}
