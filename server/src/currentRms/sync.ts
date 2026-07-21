import { prisma, logActivity } from '../db';
import { getCurrentRmsConfig, saveCurrentRmsConfig, CurrentRmsConfig } from './config';
import { fetchAllOpportunities, fetchMember, fetchOpportunityItems, RawOpportunity } from './client';
import { diffPickListItems, pickListDiffIsEmpty, type PickListItemSnapshot } from '@elexprep/shared';
import type { CurrentRmsOpportunity } from '@prisma/client';

/** Builds the comparable pick-list snapshot for a job's linked opportunity, for diffing. */
export async function fetchPickListSnapshot(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  rmsId: number
): Promise<PickListItemSnapshot[]> {
  const items = await fetchOpportunityItems(config, rmsId);
  return items.map((i) => ({
    id: i.id,
    name: i.name || i.product_name || `Item #${i.id}`,
    quantity: i.quantity ?? 1,
  }));
}

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractSubject(raw: RawOpportunity): string {
  return raw.subject || raw.name || `Opportunity #${raw.id}`;
}

/**
 * Current RMS's list endpoint returns status/state as integer codes (e.g. `status: 1`) with
 * the human label in a sibling `*_name` field (`status_name: "Provisional"`) — verified
 * against a real account. Prefer the name; fall back to stringifying the code if it's ever
 * missing, since the column is a plain string and a raw number would fail to save.
 */
function extractStatus(raw: RawOpportunity): string | null {
  const value = raw.status_name ?? raw.state_name ?? raw.status ?? raw.state;
  return value === null || value === undefined ? null : String(value);
}

/**
 * The opportunities list endpoint doesn't embed the customer record (just `member_id`) on
 * a real account, so this is usually null from sync alone — see fetchOpportunityMemberName
 * for the richer single-opportunity lookup used when importing one as a job.
 */
function extractMemberName(raw: RawOpportunity): string | null {
  const member = raw.member;
  if (!member) return null;
  return member.business_name || member.name || null;
}

/**
 * The opportunities list endpoint only returns `member_id` on a real account, not an
 * embedded customer record, so `memberName` is usually null straight out of sync. This
 * resolves it with one extra request the first time an opportunity is actually looked at
 * (imported, or its job's Current RMS tab opened) and caches the result so it's free after.
 */
export async function resolveAndCacheMemberName(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  opp: CurrentRmsOpportunity
): Promise<string | null> {
  if (opp.memberName) return opp.memberName;
  const raw = JSON.parse(opp.rawJson) as { member_id?: number | null };
  if (!raw.member_id) return null;
  const member = await fetchMember(config, raw.member_id).catch(() => null);
  const name = member?.business_name || member?.name || null;
  if (name) {
    await prisma.currentRmsOpportunity.update({ where: { id: opp.id }, data: { memberName: name } });
  }
  return name;
}

let syncing = false;

export interface SyncResult {
  pulled: number;
  alertsRaised: number;
  error: string | null;
}

/**
 * Pulls opportunities changed since the last sync (or everything, the first time), caches
 * them locally, and raises an alert on any Job whose linked opportunity actually changed —
 * "actually changed" meaning we'd already cached it before with an earlier updated_at, so a
 * first-ever sync never floods every linked job with a false alert.
 */
export async function runCurrentRmsSync(): Promise<SyncResult> {
  if (syncing) return { pulled: 0, alertsRaised: 0, error: 'A sync is already in progress' };
  syncing = true;
  const config = await getCurrentRmsConfig();
  let pulled = 0;
  let alertsRaised = 0;

  try {
    if (!config.enabled) return { pulled: 0, alertsRaised: 0, error: 'Current RMS integration is disabled' };

    const since = config.lastSyncedAt ?? undefined;
    const startedAt = new Date().toISOString();

    const raws = await fetchAllOpportunities(config, {
      updatedSince: since,
      onPage: (page) => {
        pulled += page.length;
      },
    });

    for (const raw of raws) {
      const existing = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId: raw.id } });
      const newUpdatedAt = toDate(raw.updated_at);
      const changed =
        !!existing && !!existing.rmsUpdatedAt && !!newUpdatedAt && newUpdatedAt > existing.rmsUpdatedAt;

      await prisma.currentRmsOpportunity.upsert({
        where: { rmsId: raw.id },
        create: {
          rmsId: raw.id,
          subject: extractSubject(raw),
          status: extractStatus(raw),
          memberName: extractMemberName(raw),
          startsAt: toDate(raw.starts_at),
          endsAt: toDate(raw.ends_at),
          rmsUpdatedAt: newUpdatedAt,
          rawJson: JSON.stringify(raw),
        },
        update: {
          subject: extractSubject(raw),
          status: extractStatus(raw),
          memberName: extractMemberName(raw),
          startsAt: toDate(raw.starts_at),
          endsAt: toDate(raw.ends_at),
          rmsUpdatedAt: newUpdatedAt,
          rawJson: JSON.stringify(raw),
        },
      });

      if (changed) {
        const linked = await prisma.job.findMany({
          where: { currentRmsOpportunityId: String(raw.id) },
        });
        for (const job of linked) {
          const data: Record<string, unknown> = { rmsAlertAt: new Date() };
          try {
            const snapshot = await fetchPickListSnapshot(config, raw.id);
            const prevSnapshot: PickListItemSnapshot[] = job.rmsItemsSnapshotJson
              ? JSON.parse(job.rmsItemsSnapshotJson)
              : [];
            data.rmsItemsSnapshotJson = JSON.stringify(snapshot);
            // Only flash a diff once there's an actual prior snapshot to compare against —
            // otherwise linking a job (or the first-ever sync after linking) would look like
            // every item on the pick list was just "added".
            if (prevSnapshot.length > 0) {
              const diff = diffPickListItems(prevSnapshot, snapshot);
              if (!pickListDiffIsEmpty(diff)) {
                data.rmsItemsDiffJson = JSON.stringify(diff);
                data.rmsItemsDiffAt = new Date();
              }
            }
          } catch (err) {
            // A pick-list fetch failure shouldn't block the general "opportunity changed" alert.
            console.error(`Could not diff pick list for opportunity ${raw.id}:`, (err as Error).message);
          }
          await prisma.job.update({ where: { id: job.id }, data });
          await logActivity('current_rms.opportunity_changed', extractSubject(raw), job.id);
          alertsRaised++;
        }
      }
    }

    await saveCurrentRmsConfig({ ...config, lastSyncedAt: startedAt, lastSyncError: null });
    return { pulled, alertsRaised, error: null };
  } catch (err) {
    const message = (err as Error).message;
    await saveCurrentRmsConfig({ ...config, lastSyncError: message });
    return { pulled, alertsRaised, error: message };
  } finally {
    syncing = false;
  }
}

let pollTimer: NodeJS.Timeout | null = null;

/** Starts (or restarts, after a config change) the background poll loop. */
export async function restartCurrentRmsPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const config = await getCurrentRmsConfig();
  if (!config.enabled) return;
  const intervalMs = Math.max(config.pollMinutes, 1) * 60 * 1000;
  pollTimer = setInterval(() => {
    runCurrentRmsSync().catch((err) => console.error('Current RMS poll failed:', err));
  }, intervalMs);
}
