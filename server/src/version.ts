import fs from 'fs';
import path from 'path';

// This file lives at server/src/version.ts (or server/dist/version.js once built) - either
// way one directory inside server/, so "../.." from __dirname reaches the repo root where
// VERSION and CHANGELOG.md live (see scripts/bump-version.mjs, which writes them).
const REPO_ROOT = path.resolve(__dirname, '../..');

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

function readSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const headingRe = /^## v(\S+) - (\d{4}-\d{2}-\d{2})\s*$/gm;
  const matches = [...markdown.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end);
    // Captures the +/- marker along with the text (not stripped) so the in-app changelog
    // viewer shows the same feature/fix marker the changelog file itself uses.
    const notes = [...body.matchAll(/^([+-] .+)$/gm)].map((n) => n[1].trim());
    entries.push({ version: m[1], date: m[2], notes });
  }
  return entries;
}

export function getVersionInfo(): { version: string; changelog: ChangelogEntry[] } {
  const version = readSafe(path.join(REPO_ROOT, 'VERSION'))?.trim() || '0.0.0';
  const changelogMd = readSafe(path.join(REPO_ROOT, 'CHANGELOG.md')) ?? '';
  return { version, changelog: parseChangelog(changelogMd) };
}
