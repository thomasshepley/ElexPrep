import { prisma } from '../db';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchOpportunityItems, GROUP_ITEM_TYPE, type RawOpportunityItem } from '../currentRms/client';

/** One thing to pull: a Current RMS pick-list line, or (for a job with no opportunity) a fixture type. */
export interface SourceLine {
  key: string;
  name: string;
  /** The Current RMS group heading it sits under ("Lighting - Moving Lights"). */
  group: string | null;
  rmsItemId: number | null;
  /** Current RMS product (item_id) - what a scanned asset or barcode resolves to. */
  productId: number | null;
  required: number;
  accessory: boolean;
  bookedOut: boolean;
  /** Units Current RMS has already allocated to this line, by asset number. */
  allocated: { assetNumber: string; itemAssetId: number; status: number | null }[];
}

export interface SourceLines {
  source: 'RMS' | 'FIXTURES';
  lines: SourceLine[];
  /** Why the Current RMS pick list could not be used, when it could not. */
  rmsError: string | null;
  fetchedAt: Date;
}

/** Pick lists are cached briefly so several screens and a burst of scans share one Current RMS call. */
const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: Promise<SourceLines> }>();

export function invalidateSourceLines(jobId: string) {
  cache.delete(jobId);
}

export function getSourceLines(jobId: string, opts: { fresh?: boolean } = {}): Promise<SourceLines> {
  const hit = cache.get(jobId);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = loadSourceLines(jobId);
  cache.set(jobId, { at: Date.now(), value });
  // A failed load should not stick for the cache window.
  value.catch(() => cache.delete(jobId));
  return value;
}

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * An accessory row often carries no transaction type of its own; it inherits its principal's.
 * Same rule as the Current RMS panel's Rentals-only filter (CurrentRmsPanel.tsx).
 */
function isService(all: RawOpportunityItem[], idx: number): boolean {
  const i = all[idx];
  let type = i.transaction_type_name ?? (i.transaction_type === 3 ? 'Service' : undefined);
  if (!type && i.opportunity_item_type === 2) {
    for (let j = idx - 1; j >= 0; j--) {
      const prev = all[j];
      if (prev.opportunity_item_type === 1) {
        type = prev.transaction_type_name ?? (prev.transaction_type === 3 ? 'Service' : undefined);
        break;
      }
      if (prev.opportunity_item_type === GROUP_ITEM_TYPE) break;
    }
  }
  return type === 'Service';
}

export function rmsItemsToLines(items: RawOpportunityItem[]): SourceLine[] {
  const lines: SourceLine[] = [];
  let group: string | null = null;
  items.forEach((i, idx) => {
    const name = i.name || i.product_name || `Item #${i.id}`;
    if (i.opportunity_item_type === GROUP_ITEM_TYPE) {
      group = name;
      return;
    }
    // Labour, transport and other service lines are not kit to pull.
    if (isService(items, idx)) return;
    const required = Math.max(0, Math.round(num(i.quantity, 1)));
    if (required === 0) return;
    lines.push({
      key: `rms:${i.id}`,
      name,
      group,
      rmsItemId: i.id,
      productId: typeof i.item_id === 'number' ? i.item_id : null,
      required,
      accessory: i.opportunity_item_type === 2,
      bookedOut: typeof i.status === 'number' && i.status >= 20,
      allocated: (i.item_assets ?? [])
        .filter((a) => a.stock_level_asset_number)
        .map((a) => ({ assetNumber: String(a.stock_level_asset_number), itemAssetId: a.id, status: typeof a.status === 'number' ? a.status : null })),
    });
  });
  return lines;
}

async function fixtureLines(jobId: string): Promise<SourceLine[]> {
  const counts = await prisma.fixture.groupBy({ by: ['fixtureType'], where: { jobId }, _count: { _all: true } });
  return counts
    .sort((a, b) => a.fixtureType.localeCompare(b.fixtureType))
    .map((c) => ({
      key: `case:${c.fixtureType}`,
      name: c.fixtureType,
      group: 'Fixtures',
      rmsItemId: null,
      productId: null,
      required: c._count._all,
      accessory: false,
      bookedOut: false,
      allocated: [],
    }));
}

async function loadSourceLines(jobId: string): Promise<SourceLines> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } });
  if (!job) throw new Error('Job not found');
  let rmsError: string | null = null;
  if (job.currentRmsOpportunityId) {
    const config = await getCurrentRmsConfig();
    if (!config.enabled) rmsError = 'The Current RMS integration is turned off';
    else {
      try {
        const items = await fetchOpportunityItems(config, Number(job.currentRmsOpportunityId), { withAssets: true });
        return { source: 'RMS', lines: rmsItemsToLines(items), rmsError: null, fetchedAt: new Date() };
      } catch (err) {
        rmsError = (err as Error).message;
      }
    }
  }
  return { source: 'FIXTURES', lines: await fixtureLines(jobId), rmsError, fetchedAt: new Date() };
}
