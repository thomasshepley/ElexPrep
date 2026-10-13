#!/usr/bin/env node
// Bumps the repo's VERSION file and prepends an entry to CHANGELOG.md. Run this once per
// push/merge, right before pushing, as part of committing that push's changes:
//
//   node scripts/bump-version.mjs feature "Add crew margin side-by-side comparison"
//   node scripts/bump-version.mjs fix "Fix stale sign-out and pick-list filtering"
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

const [, , kind, ...summaryParts] = process.argv;
const summary = summaryParts.join(' ').trim();

if (kind !== 'feature' && kind !== 'fix') {
  console.error('Usage: node scripts/bump-version.mjs <feature|fix> "<changelog summary>"');
  process.exit(1);
}
if (!summary) {
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
const prefix = kind === 'feature' ? '+' : '-';
const entry = `## v${next} - ${date}\n\n${prefix} ${summary}\n\n`;
const updated =
  insertAt === -1
    ? `${changelog.trimEnd()}\n\n${entry}`
    : `${changelog.slice(0, insertAt + 1)}${entry}${changelog.slice(insertAt + 1)}`;
writeFileSync(changelogPath, updated);

console.log(`Bumped version ${current} -> ${next} (${kind}): ${summary}`);
