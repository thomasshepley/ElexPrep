#!/usr/bin/env node
// Bumps the repo's VERSION file and prepends an entry to CHANGELOG.md. Run this once per
// push/merge, right before pushing, as part of committing that push's changes:
//
//   node scripts/bump-version.mjs minor "Fix stale sign-out and pick-list filtering"
//   node scripts/bump-version.mjs major "Add crew margin side-by-side comparison"
//
// Versioning scheme (as specified by the project owner - v1.0.1 is the starting point):
//   EPOCH.MINOR.PATCH, e.g. "1.0.1"
//   - a "minor" change (small fix/tweak) bumps PATCH (the last number)
//   - a "major" change (new feature/significant change) bumps MINOR (the middle number)
//   - once MINOR would go past 9, it instead rolls over: EPOCH += 1, MINOR and PATCH reset
//     to 0 - e.g. 1.9.4 -> 2.0.0 on the next major bump.
// This is deliberately simple - only the targeted number moves, except at the roll-over point.
//
// Keep the changelog summary short and human, like you're telling a teammate what changed.
// No em dashes - use a plain dash or just a comma/period instead.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = path.join(repoRoot, 'VERSION');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

const [, , kind, ...summaryParts] = process.argv;
const summary = summaryParts.join(' ').trim();

if (kind !== 'minor' && kind !== 'major') {
  console.error('Usage: node scripts/bump-version.mjs <minor|major> "<changelog summary>"');
  process.exit(1);
}
if (!summary) {
  console.error('A changelog summary is required, e.g.:\n  node scripts/bump-version.mjs minor "Fix sign-out redirect"');
  process.exit(1);
}

const current = readFileSync(versionPath, 'utf8').trim();
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) {
  console.error(`VERSION file contents "${current}" aren't in EPOCH.MINOR.PATCH form`);
  process.exit(1);
}
let [epoch, minor, patch] = match.slice(1).map(Number);

if (kind === 'minor') {
  patch += 1;
} else if (minor >= 9) {
  epoch += 1;
  minor = 0;
  patch = 0;
} else {
  minor += 1;
}

const next = `${epoch}.${minor}.${patch}`;
writeFileSync(versionPath, `${next}\n`);

const date = new Date().toISOString().slice(0, 10);
const changelog = readFileSync(changelogPath, 'utf8');
const marker = '\n## v';
const insertAt = changelog.indexOf(marker);
const entry = `## v${next} - ${date}\n\n- ${summary}\n\n`;
const updated =
  insertAt === -1
    ? `${changelog.trimEnd()}\n\n${entry}`
    : `${changelog.slice(0, insertAt + 1)}${entry}${changelog.slice(insertAt + 1)}`;
writeFileSync(changelogPath, updated);

console.log(`Bumped version ${current} -> ${next} (${kind}): ${summary}`);
