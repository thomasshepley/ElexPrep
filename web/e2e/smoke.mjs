#!/usr/bin/env node
/**
 * Browser smoke test against a running portal: signs in as staff, walks dashboard -> jobs ->
 * a job's Prep tabs (patch, cases, labels, print queue) and the other job tabs, checks the phone
 * layout doesn't scroll sideways, then (if crew credentials are given) signs in as crew and
 * opens their schedule and first job. Fails on any uncaught page error or missing screen.
 *
 *   SMOKE_BASE_URL=http://localhost:4000 SMOKE_USER=admin SMOKE_PASSWORD=... \
 *   [SMOKE_CREW_USER=... SMOKE_CREW_PASSWORD=...] npm run test:smoke
 *
 * Read-only: it never creates, edits or prints anything.
 */
import { chromium } from 'playwright';

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const USER = process.env.SMOKE_USER;
const PASSWORD = process.env.SMOKE_PASSWORD;
const CREW_USER = process.env.SMOKE_CREW_USER;
const CREW_PASSWORD = process.env.SMOKE_CREW_PASSWORD;

if (!USER || !PASSWORD) {
  console.error('Set SMOKE_USER and SMOKE_PASSWORD (a staff account) to run the smoke test.');
  process.exit(2);
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err?.message ?? err).split('\n')[0]}`);
  }
}

async function signIn(page, username, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

async function signOut(page) {
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

console.log(`Smoke test against ${BASE}`);

await step('staff sign-in', () => signIn(page, USER, PASSWORD));

await step('dashboard renders', async () => {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
});

let jobHref = null;
await step('jobs list renders', async () => {
  await page.goto(`${BASE}/jobs`);
  await page.getByRole('heading', { name: 'Jobs', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  const all = page.getByRole('button', { name: 'All', exact: true });
  if (await all.count()) await all.click();
  const first = page.locator('a[href^="/jobs/"]').first();
  if (await first.count()) jobHref = await first.getAttribute('href');
});

if (jobHref) {
  await step('job page and prep tabs render', async () => {
    await page.goto(`${BASE}${jobHref}`);
    const nav = page.locator('.secondary-nav');
    await nav.getByText('Prep', { exact: true }).click();
    for (const tab of ['Patch Import', 'Cases', 'Labels', 'Print Queue']) {
      await page.getByRole('button', { name: tab, exact: true }).first().click();
      await page.waitForLoadState('networkidle');
    }
    await page.getByRole('heading', { name: 'Printer routing' }).waitFor();
  });

  await step('other job tabs render', async () => {
    const nav = page.locator('.secondary-nav');
    for (const tab of ['Plots', 'Schedule', 'Documents', 'Contacts', 'Crew', 'Discussion', 'Current RMS', 'Job Settings']) {
      const link = nav.getByText(tab, { exact: true });
      if (!(await link.count())) continue;
      await link.click();
      await page.waitForLoadState('networkidle');
    }
  });
} else {
  console.log('  skip job pages (no jobs visible to this account)');
}

await step('phone layout has no sideways scroll', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/jobs', jobHref].filter(Boolean)) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('networkidle');
    const [scrollWidth, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (scrollWidth > width) throw new Error(`${path} is ${scrollWidth}px wide at a ${width}px viewport`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

await signOut(page);

if (CREW_USER && CREW_PASSWORD) {
  await step('crew sign-in lands on the schedule', async () => {
    await signIn(page, CREW_USER, CREW_PASSWORD);
    await page.getByRole('heading', { name: 'Your schedule' }).waitFor();
  });
  await step('crew job page renders', async () => {
    const first = page.locator('a[href^="/crew/jobs/"]').first();
    if (!(await first.count())) return;
    await first.click();
    await page.getByText('Who', { exact: true }).first().waitFor();
  });
  await signOut(page);
}

await step('no uncaught page errors', async () => {
  if (pageErrors.length) throw new Error(pageErrors.join(' | '));
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
