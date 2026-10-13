import type { BugReportAction } from '../api/client';

const MAX_ACTIONS = 15;
const actions: BugReportAction[] = [];

/** A short, human-readable description of an element - tag, id, and a visible label (aria-label/
 * title, or trimmed text content) - deliberately never an input's `.value`, so a bug report's
 * action trail can never leak whatever someone typed (a password, a note, anything). */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return label ? `${tag}${id} "${label}"` : `${tag}${id}`;
}

function recordClick(e: MouseEvent) {
  const target = e.target as Element | null;
  if (!target) return;
  // Walk up to the nearest interactive-ish ancestor - a click usually lands on an icon/span
  // deep inside a button, and that inner element alone rarely describes the action usefully.
  const interactive = target.closest('button, a, input, select, textarea, [role="button"]') ?? target;
  actions.push({ time: new Date().toISOString(), type: 'click', description: describeElement(interactive) });
  if (actions.length > MAX_ACTIONS) actions.shift();
}

/** Call once at app startup - starts a rolling, app-wide trail of the last ~15 clicks, so
 * "Submit a bug" can attach what the reporter was just doing, not just the page they're on. */
export function startActionTracking() {
  document.addEventListener('click', recordClick, true);
}

export function getRecentActions(): BugReportAction[] {
  return [...actions];
}
