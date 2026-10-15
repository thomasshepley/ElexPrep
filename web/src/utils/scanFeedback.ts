import type { ScanResult } from '../api/client';

/**
 * Warehouse-style scan sounds: a short high beep for a good scan, a long low buzz for a bad one
 * (unknown, wrong job, too many), two quick mid tones for a warning (already scanned, signed off).
 * Made with Web Audio so nothing needs downloading; the browser only allows sound after the page
 * has had one tap or key press, which the screen gets at sign-in.
 */
let ctx: AudioContext | null = null;

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = 'square', volume = 0.12) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    // No audio device: the flash still shows.
  }
}

export type ScanTone = 'good' | 'bad' | 'warn';

export function toneFor(result: ScanResult): ScanTone {
  if (result === 'OK' || result === 'SWITCH_JOB') return 'good';
  if (result === 'DUPLICATE' || result === 'LOCKED') return 'warn';
  return 'bad';
}

export function playScanTone(kind: ScanTone) {
  if (kind === 'good') tone(1800, 0, 0.09, 'square', 0.1);
  else if (kind === 'warn') {
    tone(900, 0, 0.1);
    tone(900, 0.16, 0.1);
  } else tone(180, 0, 0.6, 'sawtooth', 0.16);
}

/** Call from a tap or key press so later scans can make sound. */
export function unlockScanAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Ignore.
  }
}
