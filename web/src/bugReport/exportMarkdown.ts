import type { BugReport } from '../api/client';
import { formatDateTime } from '../utils/format';

/**
 * Turns the Webmaster page's bug reports into one Markdown document - everything the page
 * shows (notes, page, device, click trail) in a shape that can be pasted or handed straight
 * to whoever is fixing them. Built entirely in the browser from the list already loaded;
 * nothing is sent anywhere.
 */

// User-typed text goes inside fences; a stray ``` in someone's notes would otherwise end it early.
const fenceSafe = (text: string) => text.replace(/```/g, "'''");

function reportToMarkdown(r: BugReport, index: number): string {
  const firstLine = (r.notes ?? '').split('\n')[0].trim();
  const title = firstLine ? (firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine) : '(no notes)';
  const viewport = r.viewportWidth && r.viewportHeight ? `${r.viewportWidth} x ${r.viewportHeight}` : 'unknown';
  return [
    `## ${index + 1}. ${title}`,
    '',
    `- **Reported:** ${formatDateTime(r.createdAt, { withYear: true })} (${r.createdAt})`,
    `- **By:** ${r.reporterName} (${r.reporterRole})`,
    `- **Page:** ${r.pageUrl}`,
    `- **Page title:** ${r.pageTitle ?? '-'}`,
    `- **Viewport:** ${viewport}`,
    `- **User agent:** ${r.userAgent ?? 'unknown'}`,
    `- **Report id:** \`${r.id}\``,
    '',
    '**Notes**',
    '',
    '```text',
    fenceSafe(r.notes ?? '(no notes)'),
    '```',
    '',
    '**Clicks leading up to the report** (oldest first)',
    '',
    '```text',
    ...(r.recentActions.length
      ? r.recentActions.map((a) => fenceSafe(`${a.time} | ${a.type} | ${a.description}`))
      : ['(none captured)']),
    '```',
  ].join('\n');
}

export function bugReportsToMarkdown(reports: BugReport[], exportedAt = new Date()): string {
  // Oldest first reads as a timeline, and keeps numbering stable as new reports come in.
  const ordered = [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [
    '# ElexPrep bug reports',
    '',
    `Exported ${exportedAt.toISOString()} from ${window.location.origin} - ${ordered.length} report${ordered.length === 1 ? '' : 's'}.`,
    '',
    ...ordered.map((r, i) => `${reportToMarkdown(r, i)}\n`),
  ].join('\n');
}

/** Saves the Markdown as a dated .md file via a temporary object URL. */
export function downloadMarkdown(markdown: string, exportedAt = new Date()) {
  const stamp = exportedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `elexprep-bug-reports-${stamp}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
