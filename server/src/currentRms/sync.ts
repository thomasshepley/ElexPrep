import { prisma, logActivity } from '../db';
import { getCurrentRmsConfig, saveCurrentRmsConfig } from './config';
import { fetchAllOpportunities, RawOpportunity } from './client';

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractSubject(raw: RawOpportunity): string {
  return raw.subject || raw.name || `Opportunity #${raw.id}`;
}

function extractMemberName(raw: RawOpportunity): string | null {
  const member = raw.member;
  if (!member) return null;
  return member.business_name || member.name || null;
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
          status: raw.status ?? raw.state ?? null,
          memberName: extractMemberName(raw),
          startsAt: toDate(raw.starts_at),
          endsAt: toDate(raw.ends_at),
          rmsUpdatedAt: newUpdatedAt,
          rawJson: JSON.stringify(raw),
        },
        update: {
          subject: extractSubject(raw),
          status: raw.status ?? raw.state ?? null,
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
          await prisma.job.update({ where: { id: job.id }, data: { rmsAlertAt: new Date() } });
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
