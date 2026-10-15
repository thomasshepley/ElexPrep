#!/usr/bin/env node
// Bumps the repo's VERSION file and prepends an entry to CHANGELOG.md. Run this once per
// push/merge, right before pushing, as part of committing that push's changes:
//
//   node scripts/bump-version.mjs feature "Add crew margin side-by-side comparison"
//   node scripts/bump-version.mjs fix "Fix stale sign-out redirect"
//   node scripts/bump-version.mjs feature "Add chat replies" feature "Add chat images" fix "Fix pick-list filtering"
//
// One change per line: pass a separate <feature|fix> "<summary>" pair for each added feature and
// each fixed bug rather than joining several into one sentence.
//
// Lines that belong to a named area go under that area's heading: put `section "<Name>"` before
// them and every following pair lands under "### <Name>" until the next `section`. Known areas:
// "Signage Mode", "Cable calculator (beta)" and "Rigging (beta)".
//
//   node scripts/bump-version.mjs feature "Faster search" section "Signage Mode" feature "Bays" fix "Clock drift"
//
// Versioning scheme (as specified by the project owner - v1.0.1 is the starting point):
//   X.Y.Z, e.g. "1.0.1"
//   - every push bumps Z (the last digit), regardless of whether it's a feature or a fix
//   - once Z would go past 9, it rolls over instead: Y += 1, Z resets to 0
//   - once Y would go past 9, it rolls over too: X += 1, Y and Z both reset to 0
// This is deliberately simple - a push happening is the only thing that advances the version;
// "feature" vs "fix" only decides the changelog bullet's +/- marker below, not which digit
// moves.
//
// Keep the changelog summary short and human, like you're telling a teammate what changed.
// No em dashes - use a plain dash or just a comma/period instead. Only changelog a real
// feature addition or bug fix - never a documentation-only change.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = path.join(repoRoot, 'VERSION');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

// <feature|fix> "<summary>" pairs, one changelog line each.
const args = process.argv.slice(2);
const entries = [];
let section = '';
for (let i = 0; i < args.length; i += 2) {
  const kind = args[i];
  const summary = (args[i + 1] ?? '').trim();
  if (kind === 'section' && summary) {
    section = summary;
    continue;
  }
  if ((kind !== 'feature' && kind !== 'fix') || !summary) {
    console.error('Usage: node scripts/bump-version.mjs [section "<Name>"] <feature|fix> "<summary>" [...]');
    process.exit(1);
  }
  entries.push({ kind, summary, section });
}
if (entries.length === 0) {
  console.error('A changelog summary is required, e.g.:\n  node scripts/bump-version.mjs fix "Fix sign-out redirect"');
  process.exit(1);
}

const current = readFileSync(versionPath, 'utf8').trim();
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  console.error(`VERSION file contents "${current}" aren't in X.Y.Z form`);
  process.exit(1);
}
let [x, y, z] = match.slice(1).map(Number);

z += 1;
if (z > 9) {
  z = 0;
  y += 1;
  if (y > 9) {
    y = 0;
    x += 1;
  }
}

const next = `${x}.${y}.${z}`;
writeFileSync(versionPath, `${next}\n`);

const date = new Date().toISOString().slice(0, 10);
const changelog = readFileSync(changelogPath, 'utf8');
const marker = '\n## v';
const insertAt = changelog.indexOf(marker);
// Ungrouped lines first, then each section in the order it was first named; within each, features
// first, then fixes.
const sections = [...new Set(entries.map((e) => e.section))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
const blocks = sections.map((name) => {
  const own = entries.filter((e) => e.section === name);
  const lines = [...own.filter((e) => e.kind === 'feature'), ...own.filter((e) => e.kind === 'fix')].map(
    (e) => `${e.kind === 'feature' ? '+' : '-'} ${e.summary}`
  );
  return `${name ? `### ${name}\n\n` : ''}${lines.join('\n')}`;
});
const lines = blocks;
const entry = `## v${next} - ${date}\n\n${blocks.join('\n\n')}\n\n`;
const updated =
  insertAt === -1
    ? `${changelog.trimEnd()}\n\n${entry}`
    : `${changelog.slice(0, insertAt + 1)}${entry}${changelog.slice(insertAt + 1)}`;
writeFileSync(changelogPath, updated);

console.log(`Bumped version ${current} -> ${next}:\n${lines.join('\n')}`);
