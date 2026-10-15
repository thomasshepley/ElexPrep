import type { PrepSession } from '@prisma/client';
import { resolveLocationColor } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { loadLocationColorMap } from '../pdf/locationColors';
import { getCurrentRmsConfig } from '../currentRms/config';
import { findProductByBarcode, findStockLevelByAssetNumber } from '../currentRms/client';
import { notifyPrepMissing } from '../notifications';
import { emitJobEvent } from './events';
import { getSourceLines, type SourceLine } from './lines';
import { bookOutPrepared, queuePrepare } from './writeBack';

export type PrepStatus = 'OPEN' | 'AWAITING_TRANSPORT' | 'BOOKED_OUT';
export type ScanSource = 'HID' | 'PHONE' | 'TAP' | 'MANUAL';
export type ScanResult = 'OK' | 'OVER' | 'DUPLICATE' | 'WRONG_JOB' | 'UNKNOWN' | 'LOCKED' | 'SWITCH_JOB';

export interface Actor {
  userId: string;
  name: string;
  deviceId?: string | null;
}

/** Scans for one job are applied one at a time so two scanners can never double count a unit. */
const locks = new Map<string, Promise<unknown>>();
export function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(jobId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(jobId, run);
  run.finally(() => {
    if (locks.get(jobId) === run) locks.delete(jobId);
  }).catch(() => {});
  return run;
}

/** The job's prep run: the newest one, whatever its state. */
export async function latestSession(jobId: string) {
  return prisma.prepSession.findFirst({ where: { jobId }, orderBy: { createdAt: 'desc' } });
}

/** The session scans go into, opened on the first scan or tap. Null when the prep is signed off. */
async function openSessionFor(jobId: string, actor: Actor): Promise<PrepSession | null> {
  const latest = await latestSession(jobId);
  if (latest?.status === 'OPEN') return latest;
  if (latest) return null;
  const session = await prisma.prepSession.create({ data: { jobId, startedByUserId: actor.userId } });
  // Carry over ticks from the old one-tick-per-line pick list so nothing already pulled is lost.
  const old = await prisma.pickListItemStatus.findMany({ where: { jobId, prepped: true } });
  if (old.length > 0) {
    const { lines } = await getSourceLines(jobId);
    const byItem = new Map(lines.filter((l) => l.rmsItemId !== null).map((l) => [l.rmsItemId!, l]));
    for (const o of old) {
      const line = byItem.get(o.rmsItemId);
      if (line) {
        await prisma.prepLineState.create({
          data: { prepSessionId: session.id, lineKey: line.key, name: line.name, required: line.required, pulled: line.required },
        });
      }
    }
  }
  await logActivity('prep.started', `Prep started by ${actor.name}`, jobId, actor.userId);
  return session;
}

/** Lines to show: the live pick list, or when Current RMS can't be reached, the lines this
 * prep already knows about, so a bay keeps working through an outage. */
async function effectiveLines(jobId: string, session: PrepSession | null): Promise<{ lines: SourceLine[]; source: 'RMS' | 'FIXTURES' | 'OFFLINE'; rmsError: string | null; fetchedAt: Date }> {
  const src = await getSourceLines(jobId);
  if (src.source === 'FIXTURES' && src.rmsError && session) {
    const states = await prisma.prepLineState.findMany({ where: { prepSessionId: session.id, lineKey: { startsWith: 'rms:' } } });
    if (states.length > 0) {
      return {
        source: 'OFFLINE',
        rmsError: src.rmsError,
        fetchedAt: src.fetchedAt,
        lines: states.map((s) => ({
          key: s.lineKey,
          name: s.name,
          group: null,
          rmsItemId: Number(s.lineKey.slice(4)),
          productId: null,
          required: s.required,
          accessory: false,
          bookedOut: false,
          allocated: [],
        })),
      };
    }
  }
  return src;
}

async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

export interface ViewLine {
  key: string;
  productId: number | null;
  name: string;
  group: string | null;
  required: number;
  pulled: number;
  short: number;
  shortNote: string | null;
  accessory: boolean;
  bookedOut: boolean;
  done: boolean;
  /** Pulled beyond what the line now needs (the pick list went down after it was pulled). */
  over: number;
}

/** Everything the prep screen draws, in one response. */
export async function buildPrepView(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, name: true, venue: true, logoPath: true, startsAt: true, endsAt: true, currentRmsOpportunityId: true, rmsItemsDiffJson: true },
  });
  if (!job) return null;
  const session = await latestSession(jobId);
  const [{ lines, source, rmsError, fetchedAt }, states, scans, cases, colorMap] = await Promise.all([
    effectiveLines(jobId, session),
    session ? prisma.prepLineState.findMany({ where: { prepSessionId: session.id } }) : Promise.resolve([]),
    session ? prisma.scanEvent.findMany({ where: { prepSessionId: session.id }, orderBy: { createdAt: 'desc' }, take: 12 }) : Promise.resolve([]),
    prisma.caseGroupRecord.findMany({ where: { jobId }, select: { id: true, label: true, location: true, fixtureType: true, packedAt: true }, orderBy: { label: 'asc' } }),
    loadLocationColorMap(jobId),
  ]);
  const stateByKey = new Map(states.map((s) => [s.lineKey, s]));
  const viewLines: ViewLine[] = lines.map((l) => {
    const s = stateByKey.get(l.key);
    const rawPulled = s?.pulled ?? 0;
    const pulled = Math.min(rawPulled, l.required);
    const short = s?.short ?? 0;
    return {
      key: l.key,
      productId: l.productId,
      name: l.name,
      group: l.group,
      required: l.required,
      pulled,
      short,
      shortNote: s?.shortNote ?? null,
      accessory: l.accessory,
      bookedOut: l.bookedOut,
      done: pulled + short >= l.required,
      over: Math.max(0, rawPulled - l.required),
    };
  });

  const groupOrder: string[] = [];
  const groups = new Map<string, { name: string; required: number; pulled: number; lines: ViewLine[] }>();
  for (const l of viewLines) {
    const name = l.group ?? 'Other';
    if (!groups.has(name)) {
      groupOrder.push(name);
      groups.set(name, { name, required: 0, pulled: 0, lines: [] });
    }
    const g = groups.get(name)!;
    g.required += l.required;
    g.pulled += l.pulled;
    g.lines.push(l);
  }

  const byLocation = new Map<string, { location: string; color: string; pattern: string; total: number; packed: number; cases: typeof cases }>();
  for (const c of cases) {
    const location = c.location?.trim() || 'No location';
    if (!byLocation.has(location)) {
      const color = resolveLocationColor(colorMap, c.location);
      byLocation.set(location, { location, color: color.color, pattern: color.pattern, total: 0, packed: 0, cases: [] });
    }
    const entry = byLocation.get(location)!;
    entry.total++;
    if (c.packedAt) entry.packed++;
    entry.cases.push(c);
  }

  const names = await userNames([
    session?.startedByUserId,
    session?.completedByUserId,
    session?.transportByUserId,
    session?.flagResolvedByUserId,
    ...scans.map((s) => s.userId),
  ]);
  const required = viewLines.reduce((n, l) => n + l.required, 0);
  const pulled = viewLines.reduce((n, l) => n + l.pulled, 0);
  const short = viewLines.reduce((n, l) => n + l.short, 0);
  const next = viewLines.find((l) => !l.done) ?? null;

  return {
    job: {
      id: job.id,
      name: job.name,
      venue: job.venue,
      hasLogo: Boolean(job.logoPath),
      startsAt: job.startsAt,
      endsAt: job.endsAt,
      linked: Boolean(job.currentRmsOpportunityId),
      hasRmsDiff: Boolean(job.rmsItemsDiffJson),
    },
    source,
    rmsError,
    fetchedAt,
    session: session
      ? {
          id: session.id,
          status: session.status as PrepStatus,
          startedAt: session.startedAt,
          startedBy: names.get(session.startedByUserId ?? '') ?? null,
          completedAt: session.completedAt,
          completedBy: names.get(session.completedByUserId ?? '') ?? null,
          transportAt: session.transportAt,
          transportBy: names.get(session.transportByUserId ?? '') ?? null,
          missing: session.missingJson ? (JSON.parse(session.missingJson) as MissingLine[]) : [],
          flaggedAt: session.flaggedAt,
          flagResolvedAt: session.flagResolvedAt,
          flagResolvedBy: names.get(session.flagResolvedByUserId ?? '') ?? null,
          bookOut: session.bookOutJson ? JSON.parse(session.bookOutJson) : null,
        }
      : null,
    totals: { lines: viewLines.length, linesDone: viewLines.filter((l) => l.done).length, required, pulled, short },
    next,
    groups: groupOrder.map((g) => groups.get(g)!),
    shortages: viewLines.filter((l) => l.short > 0),
    cases: [...byLocation.values()].map((l) => ({
      ...l,
      cases: l.cases.map((c) => ({ id: c.id, label: c.label, fixtureType: c.fixtureType, packed: Boolean(c.packedAt) })),
    })),
    recentScans: scans.map((s) => ({
      id: s.id,
      code: s.code,
      kind: s.kind,
      result: s.result,
      message: s.message,
      source: s.source,
      by: names.get(s.userId ?? '') ?? null,
      at: s.createdAt,
    })),
  };
}

export type PrepView = NonNullable<Awaited<ReturnType<typeof buildPrepView>>>;

interface MissingLine {
  key: string;
  name: string;
  required: number;
  pulled: number;
  short: number;
  shortNote: string | null;
}

async function recordScan(data: {
  jobId: string;
  prepSessionId: string | null;
  code: string;
  kind: string;
  lineKey?: string | null;
  result: ScanResult;
  message: string;
  source: ScanSource;
  actor: Actor;
}) {
  const event = await prisma.scanEvent.create({
    data: {
      jobId: data.jobId,
      prepSessionId: data.prepSessionId,
      code: data.code.slice(0, 200),
      kind: data.kind,
      lineKey: data.lineKey ?? null,
      result: data.result,
      message: data.message,
      source: data.source,
      deviceId: data.actor.deviceId ?? null,
      userId: data.actor.userId,
    },
  });
  const payload = { id: event.id, code: event.code, kind: event.kind, result: event.result, message: event.message, source: event.source, lineKey: event.lineKey, by: data.actor.name, at: event.createdAt };
  emitJobEvent(data.jobId, 'scan', payload);
  emitJobEvent(data.jobId, 'prep');
  return payload;
}

/** Codes Current RMS didn't recognise, so a repeat scan doesn't cost two more API calls. */
const unknownCodes = new Map<string, number>();
const UNKNOWN_TTL_MS = 5 * 60_000;

interface Resolved {
  kind: 'ASSET' | 'PRODUCT' | 'JOB' | 'UNKNOWN';
  productId?: number | null;
  serialised?: boolean;
  label?: string;
  line?: SourceLine;
  alreadyAllocated?: boolean;
  jobId?: string;
  error?: string;
}

/** What a scanned code is: an asset allocated on this job, then a known alias, then a Current RMS lookup. */
async function resolveCode(code: string, lines: SourceLine[]): Promise<Resolved> {
  if (code.startsWith('EP:J:')) return { kind: 'JOB', jobId: code.slice(5) };
  for (const line of lines) {
    if (line.allocated.some((a) => a.assetNumber === code)) {
      return { kind: 'ASSET', productId: line.productId, serialised: true, label: line.name, line, alreadyAllocated: true };
    }
  }
  let alias = await prisma.barcodeAlias.findUnique({ where: { code } });
  if (!alias) {
    const seen = unknownCodes.get(code);
    if (seen && Date.now() - seen < UNKNOWN_TTL_MS) return { kind: 'UNKNOWN' };
    const config = await getCurrentRmsConfig();
    if (config.enabled && config.apiKey) {
      try {
        const stock = await findStockLevelByAssetNumber(config, code);
        if (stock?.item_id) {
          const bulk = /bulk/i.test(stock.stock_category_name ?? '') || stock.stock_category === 50;
          alias = await prisma.barcodeAlias.create({
            data: { code, kind: bulk ? 'PRODUCT' : 'ASSET', rmsProductId: stock.item_id, rmsStockLevelId: stock.id, label: stock.item_name ?? `Product ${stock.item_id}` },
          });
        } else {
          const product = await findProductByBarcode(config, code);
          if (product) {
            alias = await prisma.barcodeAlias.create({ data: { code, kind: 'PRODUCT', rmsProductId: product.id, label: product.name ?? `Product ${product.id}` } });
          }
        }
      } catch (err) {
        return { kind: 'UNKNOWN', error: `Could not reach Current RMS to look this code up (${(err as Error).message.slice(0, 120)})` };
      }
    }
    if (!alias) {
      unknownCodes.set(code, Date.now());
      return { kind: 'UNKNOWN' };
    }
  }
  return { kind: alias.kind === 'PRODUCT' ? 'PRODUCT' : 'ASSET', productId: alias.rmsProductId, serialised: alias.kind !== 'PRODUCT', label: alias.label };
}

export function forgetUnknownCode(code: string) {
  unknownCodes.delete(code);
}

async function bumpLine(sessionId: string, line: SourceLine, delta: number) {
  const existing = await prisma.prepLineState.findUnique({ where: { prepSessionId_lineKey: { prepSessionId: sessionId, lineKey: line.key } } });
  const pulled = Math.max(0, Math.min(line.required, (existing?.pulled ?? 0) + delta));
  return prisma.prepLineState.upsert({
    where: { prepSessionId_lineKey: { prepSessionId: sessionId, lineKey: line.key } },
    create: { prepSessionId: sessionId, lineKey: line.key, name: line.name, required: line.required, pulled },
    update: { pulled, required: line.required, name: line.name },
  });
}

/** One scan from a hardware scanner or a phone. */
export async function applyScan(jobId: string, rawCode: string, source: ScanSource, actor: Actor) {
  const code = rawCode.trim();
  return withJobLock(jobId, async () => {
    const latest = await latestSession(jobId);
    const { lines } = await effectiveLines(jobId, latest);
    const resolved = await resolveCode(code, lines);

    if (resolved.kind === 'JOB') {
      return recordScan({ jobId, prepSessionId: latest?.id ?? null, code, kind: 'JOB', result: 'SWITCH_JOB', message: 'Job sheet scanned', source, actor }).then((p) => ({ ...p, switchToJobId: resolved.jobId }));
    }
    if (latest && latest.status !== 'OPEN') {
      return recordScan({ jobId, prepSessionId: latest.id, code, kind: resolved.kind, result: 'LOCKED', message: 'This prep is signed off. An admin can reopen it.', source, actor });
    }
    if (resolved.kind === 'UNKNOWN') {
      return recordScan({ jobId, prepSessionId: latest?.id ?? null, code, kind: 'UNKNOWN', result: 'UNKNOWN', message: resolved.error ?? `Unknown barcode ${code}`, source, actor });
    }

    const session = (await openSessionFor(jobId, actor))!;
    const candidates = resolved.line ? [resolved.line] : lines.filter((l) => resolved.productId != null && l.productId === resolved.productId);
    if (candidates.length === 0) {
      return recordScan({ jobId, prepSessionId: session.id, code, kind: resolved.kind, result: 'WRONG_JOB', message: `${resolved.label ?? code} is not on this job`, source, actor });
    }
    if (resolved.serialised) {
      const dup = await prisma.prepAssetScan.findFirst({ where: { prepSessionId: session.id, code, serialised: true } });
      if (dup) {
        return recordScan({ jobId, prepSessionId: session.id, code, kind: resolved.kind, lineKey: dup.lineKey, result: 'DUPLICATE', message: `${resolved.label ?? code} (${code}) was already scanned`, source, actor });
      }
    }
    const states = await prisma.prepLineState.findMany({ where: { prepSessionId: session.id, lineKey: { in: candidates.map((c) => c.key) } } });
    const pulledByKey = new Map(states.map((s) => [s.lineKey, s.pulled + s.short]));
    const line = candidates.find((c) => (pulledByKey.get(c.key) ?? 0) < c.required);
    if (!line) {
      const c = candidates[0];
      return recordScan({ jobId, prepSessionId: session.id, code, kind: resolved.kind, lineKey: c.key, result: 'OVER', message: `Too many: ${c.name} already has all ${c.required}`, source, actor });
    }
    const state = await bumpLine(session.id, line, 1);
    const asset = await prisma.prepAssetScan.create({
      data: { prepSessionId: session.id, code, serialised: Boolean(resolved.serialised), lineKey: line.key, rmsItemId: line.rmsItemId, userId: actor.userId },
    });
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } });
    if (job?.currentRmsOpportunityId && line.rmsItemId !== null) {
      await queuePrepare({
        assetScanId: asset.id,
        jobId,
        opportunityId: Number(job.currentRmsOpportunityId),
        code,
        alreadyAllocated: Boolean(resolved.alreadyAllocated),
        userId: actor.userId,
      });
    }
    return recordScan({ jobId, prepSessionId: session.id, code, kind: resolved.kind, lineKey: line.key, result: 'OK', message: `${line.name}: ${state.pulled} of ${line.required}`, source, actor });
  });
}

/** A tap on the screen: plus one, minus one, or mark some of a line short with a note. */
export async function adjustLine(
  jobId: string,
  lineKey: string,
  change: { delta?: number; short?: number; shortNote?: string | null },
  actor: Actor
) {
  return withJobLock(jobId, async () => {
    const latest = await latestSession(jobId);
    if (latest && latest.status !== 'OPEN') return { error: 'This prep is signed off. An admin can reopen it.' };
    const { lines } = await effectiveLines(jobId, latest);
    const line = lines.find((l) => l.key === lineKey);
    if (!line) return { error: 'That line is no longer on the pick list' };
    const session = (await openSessionFor(jobId, actor))!;
    let state = await prisma.prepLineState.findUnique({ where: { prepSessionId_lineKey: { prepSessionId: session.id, lineKey } } });
    let message = '';
    if (change.delta) {
      const delta = Math.sign(change.delta);
      state = await bumpLine(session.id, line, delta);
      // Taking one off un-counts the newest scanned unit, so that asset can be scanned again.
      if (delta < 0) {
        const last = await prisma.prepAssetScan.findFirst({ where: { prepSessionId: session.id, lineKey }, orderBy: { createdAt: 'desc' } });
        if (last) await prisma.prepAssetScan.delete({ where: { id: last.id } });
      }
      message = `${line.name}: ${state.pulled} of ${line.required}`;
    }
    if (change.short !== undefined || change.shortNote !== undefined) {
      const pulled = state?.pulled ?? 0;
      const short = change.short !== undefined ? Math.max(0, Math.min(line.required - pulled, Math.round(change.short))) : state?.short ?? 0;
      const shortNote = change.shortNote !== undefined ? (change.shortNote?.trim().slice(0, 300) || null) : state?.shortNote ?? null;
      state = await prisma.prepLineState.upsert({
        where: { prepSessionId_lineKey: { prepSessionId: session.id, lineKey } },
        create: { prepSessionId: session.id, lineKey, name: line.name, required: line.required, short, shortNote },
        update: { short, shortNote },
      });
      message = short > 0 ? `${line.name}: ${short} short${shortNote ? ` (${shortNote})` : ''}` : `${line.name}: shortage cleared`;
    }
    const scan = await recordScan({ jobId, prepSessionId: session.id, code: lineKey, kind: 'TAP', lineKey, result: 'OK', message, source: 'TAP', actor });
    return { scan };
  });
}

export async function setCasePacked(jobId: string, caseId: string, packed: boolean, actor: Actor) {
  const c = await prisma.caseGroupRecord.findFirst({ where: { id: caseId, jobId } });
  if (!c) return null;
  const updated = await prisma.caseGroupRecord.update({
    where: { id: c.id },
    data: { packedAt: packed ? new Date() : null, packedByUserId: packed ? actor.userId : null },
  });
  emitJobEvent(jobId, 'prep');
  return updated;
}

function missingLines(view: PrepView): MissingLine[] {
  return view.groups
    .flatMap((g) => g.lines)
    .filter((l) => l.pulled < l.required)
    .map((l) => ({ key: l.key, name: l.name, required: l.required, pulled: l.pulled, short: l.short, shortNote: l.shortNote }));
}

/** "Prep complete": the session moves to Awaiting Transport; anything missing is flagged to admins. */
export async function signOff(jobId: string, actor: Actor) {
  return withJobLock(jobId, async () => {
    let session = await latestSession(jobId);
    if (session && session.status !== 'OPEN') return { error: 'This prep is already signed off' };
    if (!session) session = (await openSessionFor(jobId, actor))!;
    const view = (await buildPrepView(jobId))!;
    const missing = missingLines(view);
    const jobName = view.job.name;
    await prisma.prepSession.update({
      where: { id: session.id },
      data: {
        status: 'AWAITING_TRANSPORT',
        completedAt: new Date(),
        completedByUserId: actor.userId,
        missingJson: JSON.stringify(missing),
        flaggedAt: missing.length > 0 ? new Date() : null,
        flagResolvedAt: null,
        flagResolvedByUserId: null,
      },
    });
    await logActivity(
      'prep.signed_off',
      `Prep signed off by ${actor.name}: ${view.totals.pulled} of ${view.totals.required} pulled${missing.length ? `, ${missing.length} lines missing (${missing.map((m) => `${m.name} ${m.pulled}/${m.required}`).join(', ').slice(0, 500)})` : ''}`,
      jobId,
      actor.userId
    );
    if (missing.length > 0) await notifyPrepMissing(jobId, jobName, 'signed off', missing.length);
    emitJobEvent(jobId, 'prep');
    return { missing };
  });
}

/** Transport has arrived: book out what was prepped and flag anything that wasn't. */
export async function transportArrived(jobId: string, actor: Actor) {
  return withJobLock(jobId, async () => {
    const session = await latestSession(jobId);
    if (!session || session.status !== 'AWAITING_TRANSPORT') return { error: 'Sign the prep off before marking transport arrived' };
    const view = (await buildPrepView(jobId))!;
    const notPrepped = missingLines(view);
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } });
    const bookOut = job?.currentRmsOpportunityId
      ? await bookOutPrepared({ jobId, opportunityId: Number(job.currentRmsOpportunityId), userId: actor.userId })
      : { mode: 'OFF' as const, itemAssetIds: [], ok: true, errors: [], warnings: [] };
    await prisma.prepSession.update({
      where: { id: session.id },
      data: {
        status: 'BOOKED_OUT',
        transportAt: new Date(),
        transportByUserId: actor.userId,
        bookOutJson: JSON.stringify({ ...bookOut, notPrepped }),
        flaggedAt: notPrepped.length > 0 || !bookOut.ok ? session.flaggedAt ?? new Date() : session.flaggedAt,
      },
    });
    await logActivity(
      'prep.booked_out',
      `Transport arrived, marked by ${actor.name}. ${bookOut.mode === 'LIVE' ? `${bookOut.itemAssetIds.length} units booked out in Current RMS` : bookOut.mode === 'DRY_RUN' ? `Dry run: would book out ${bookOut.itemAssetIds.length} units` : 'Current RMS write-back is off'}${notPrepped.length ? `. Not prepped: ${notPrepped.map((m) => `${m.name} ${m.pulled}/${m.required}`).join(', ').slice(0, 500)}` : ''}${bookOut.errors.length ? `. Errors: ${bookOut.errors.join('; ').slice(0, 300)}` : ''}`,
      jobId,
      actor.userId
    );
    if (notPrepped.length > 0) await notifyPrepMissing(jobId, view.job.name, 'booked out', notPrepped.length);
    emitJobEvent(jobId, 'prep');
    return { notPrepped, bookOut };
  });
}

/** Admin: back to OPEN from Awaiting Transport, or start a fresh prep after book-out. */
export async function reopenPrep(jobId: string, actor: Actor) {
  return withJobLock(jobId, async () => {
    const session = await latestSession(jobId);
    if (!session) return { error: 'There is no prep to reopen' };
    if (session.status === 'AWAITING_TRANSPORT') {
      await prisma.prepSession.update({ where: { id: session.id }, data: { status: 'OPEN', completedAt: null, completedByUserId: null } });
      await logActivity('prep.reopened', `Prep reopened by ${actor.name}`, jobId, actor.userId);
    } else if (session.status === 'BOOKED_OUT') {
      await prisma.prepSession.create({ data: { jobId, startedByUserId: actor.userId } });
      await logActivity('prep.restarted', `New prep started by ${actor.name}`, jobId, actor.userId);
    } else {
      return { error: 'The prep is already open' };
    }
    emitJobEvent(jobId, 'prep');
    return {};
  });
}

export async function resolveFlag(jobId: string, actor: Actor) {
  const session = await latestSession(jobId);
  if (!session?.flaggedAt) return { error: 'Nothing is flagged' };
  await prisma.prepSession.update({ where: { id: session.id }, data: { flagResolvedAt: new Date(), flagResolvedByUserId: actor.userId } });
  await logActivity('prep.flag_resolved', `Missing kit flag cleared by ${actor.name}`, jobId, actor.userId);
  emitJobEvent(jobId, 'prep');
  return {};
}

/** Each job's prep state, for job lists. */
export async function prepStatuses(jobIds: string[]) {
  const out = new Map<string, { status: PrepStatus; flagged: boolean }>();
  if (jobIds.length === 0) return out;
  const sessions = await prisma.prepSession.findMany({ where: { jobId: { in: jobIds } }, orderBy: { createdAt: 'desc' } });
  for (const s of sessions) {
    if (!out.has(s.jobId)) out.set(s.jobId, { status: s.status as PrepStatus, flagged: Boolean(s.flaggedAt && !s.flagResolvedAt) });
  }
  return out;
}
