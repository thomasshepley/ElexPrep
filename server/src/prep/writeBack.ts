import { prisma, logActivity } from '../db';
import { getCurrentRmsConfig } from '../currentRms/config';
import { bookOutItemAssets, fetchOpportunityItems, ITEM_ASSET_PREPARED, quickAllocate, quickPrepare } from '../currentRms/client';
import { getPrepConfig } from './config';

/**
 * Sends prep scans to Current RMS one at a time. The API allows 60 requests a minute and the
 * client already spaces every call 1.1 s apart, so a busy bay's scans queue here instead of
 * tripping the limit; the screen never waits on this.
 */

type Task = () => Promise<void>;
let chain: Promise<void> = Promise.resolve();
let pending = 0;

function enqueue(task: Task) {
  pending++;
  chain = chain
    .then(task)
    .catch((err) => console.error('Prep write-back failed:', (err as Error).message))
    .finally(() => {
      pending--;
    });
}

export function writeBackQueueLength() {
  return pending;
}

/**
 * Marks one scanned unit prepared in Current RMS: quick_prepare when the unit is already
 * allocated to the opportunity, otherwise quick_allocate with mark_as_prepared so the scan
 * allocates and prepares in one call (the same as Current RMS's own "Mark as prepared" scan).
 */
export async function queuePrepare(opts: { assetScanId: string; jobId: string; opportunityId: number; code: string; alreadyAllocated: boolean; userId?: string }) {
  const prep = await getPrepConfig();
  if (prep.rmsWriteBack === 'OFF') return;
  const call = opts.alreadyAllocated ? 'quick_prepare' : 'quick_allocate';
  const body = opts.alreadyAllocated
    ? { stock_level_asset_number: opts.code }
    : { stock_level_asset_number: opts.code, quantity: 1, mark_as_prepared: 1 };
  if (prep.rmsWriteBack === 'DRY_RUN') {
    await logActivity('prep.rms_dry_run', `Would send ${call} ${JSON.stringify(body)} to opportunity ${opts.opportunityId}`, opts.jobId, opts.userId);
    return;
  }
  enqueue(async () => {
    const config = await getCurrentRmsConfig();
    try {
      if (opts.alreadyAllocated) await quickPrepare(config, opts.opportunityId, body);
      else await quickAllocate(config, opts.opportunityId, body);
      await prisma.prepAssetScan.update({ where: { id: opts.assetScanId }, data: { rmsPreparedAt: new Date(), rmsError: null } }).catch(() => {});
    } catch (err) {
      const message = (err as Error).message.slice(0, 300);
      await prisma.prepAssetScan.update({ where: { id: opts.assetScanId }, data: { rmsError: message } }).catch(() => {});
      await logActivity('prep.rms_prepare_failed', `${opts.code}: ${message}`, opts.jobId, opts.userId);
    }
  });
}

export interface BookOutResult {
  mode: 'OFF' | 'DRY_RUN' | 'LIVE';
  itemAssetIds: number[];
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Books out everything Current RMS has as Prepared on the opportunity, in one request. */
export async function bookOutPrepared(opts: { jobId: string; opportunityId: number; userId?: string }): Promise<BookOutResult> {
  const prep = await getPrepConfig();
  if (prep.rmsWriteBack === 'OFF') return { mode: 'OFF', itemAssetIds: [], ok: true, errors: [], warnings: [] };
  const config = await getCurrentRmsConfig();
  // Wait for any scans still queued so the units they prepare are included.
  await chain;
  let ids: number[] = [];
  try {
    const items = await fetchOpportunityItems(config, opts.opportunityId, { withAssets: true });
    ids = items.flatMap((i) => (i.item_assets ?? []).filter((a) => a.status === ITEM_ASSET_PREPARED).map((a) => a.id));
  } catch (err) {
    return { mode: prep.rmsWriteBack, itemAssetIds: [], ok: false, errors: [(err as Error).message], warnings: [] };
  }
  if (prep.rmsWriteBack === 'DRY_RUN') {
    await logActivity('prep.rms_dry_run', `Would send book_out for ${ids.length} prepared units to opportunity ${opts.opportunityId}`, opts.jobId, opts.userId);
    return { mode: 'DRY_RUN', itemAssetIds: ids, ok: true, errors: [], warnings: [] };
  }
  if (ids.length === 0) return { mode: 'LIVE', itemAssetIds: [], ok: true, errors: [], warnings: ['Nothing was marked prepared in Current RMS'] };
  try {
    const res = await bookOutItemAssets(config, opts.opportunityId, ids);
    const ok = res.result !== false;
    if (ok) {
      await prisma.prepAssetScan.updateMany({
        where: { prepSession: { jobId: opts.jobId }, rmsPreparedAt: { not: null }, rmsBookedOutAt: null },
        data: { rmsBookedOutAt: new Date() },
      });
    }
    return { mode: 'LIVE', itemAssetIds: res.item_asset_ids ?? ids, ok, errors: res.error_messages ?? [], warnings: res.warning_messages ?? [] };
  } catch (err) {
    return { mode: 'LIVE', itemAssetIds: ids, ok: false, errors: [(err as Error).message], warnings: [] };
  }
}
