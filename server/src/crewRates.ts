import { prisma } from './db';

/**
 * One place that decides what a crew member costs on a job - used by both the job's Crew tab
 * (routes/jobCrewAssignments.ts) and the admin-only crew margin (routes/currentRms.ts) so the
 * two can never disagree.
 *
 * The day rate ELEX pays, most specific first:
 *   1. zero-rated on this job            -> 0
 *   2. this person's rate on this job    (JobCrewAssignment.dayRate)
 *   3. this job's rate for their role    (RoleRate with jobId)
 *   4. this person's agreed rate         (CrewProfile.dayRate, admin-set on Users & crew)
 *   5. the portal rate for their role    (RoleRate with no job)
 *   6. the portal default day rate       (Crew settings page)
 * A day can then override that for one day only (JobDayCrewAssignment.dayRate).
 *
 * What the crew member asks for on their own rate card is never used for costing; it's shown
 * alongside as their suggested rate.
 */

/** Matches the label RateCardEditor.tsx gives a crew member's baseline line. */
export const GENERAL_DAY_RATE_LABEL = 'General day rate';

export function toMoney(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Roles match case- and space-insensitively: "LX Tech", " lx tech " and "LX  Tech" are one. */
export function roleKey(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface RateLine {
  label: string;
  amount: string;
}

export type RateSource = 'zero' | 'override' | 'jobRole' | 'profile' | 'globalRole' | 'default' | 'none';

export interface RateTables {
  /** roleKey -> rate for this job. */
  job: Map<string, number>;
  /** roleKey -> portal-wide rate. */
  global: Map<string, number>;
  defaultRate: number;
}

export interface ResolvedRate {
  rate: number;
  source: RateSource;
}

/** What they'd ask for themselves: their rate-card line for the role, else their general line. */
export function crewSuggestedRate(role: string, rateLines: RateLine[]): { rate: number; source: 'role' | 'rateCard' | 'none' } {
  const key = roleKey(role);
  const roleLine = key ? rateLines.find((l) => roleKey(l.label) === key) : undefined;
  if (roleLine && toMoney(roleLine.amount)) return { rate: toMoney(roleLine.amount), source: 'role' };
  const general = rateLines.find((l) => l.label === GENERAL_DAY_RATE_LABEL);
  if (general && toMoney(general.amount)) return { rate: toMoney(general.amount), source: 'rateCard' };
  return { rate: 0, source: 'none' };
}

/** The rate this assignment would use without its own override (steps 3-6 above). */
export function inheritedDayRate(role: string, profileDayRate: string | null, tables: RateTables): ResolvedRate {
  const key = roleKey(role);
  const jobRole = tables.job.get(key);
  if (jobRole) return { rate: jobRole, source: 'jobRole' };
  if (toMoney(profileDayRate)) return { rate: toMoney(profileDayRate), source: 'profile' };
  const globalRole = tables.global.get(key);
  if (globalRole) return { rate: globalRole, source: 'globalRole' };
  if (tables.defaultRate) return { rate: tables.defaultRate, source: 'default' };
  return { rate: 0, source: 'none' };
}

export function effectiveDayRate(
  assignment: { role: string; dayRate: string | null; zeroRated: boolean },
  profileDayRate: string | null,
  tables: RateTables
): ResolvedRate & { inherited: ResolvedRate } {
  const inherited = inheritedDayRate(assignment.role, profileDayRate, tables);
  if (assignment.zeroRated) return { rate: 0, source: 'zero', inherited };
  if (toMoney(assignment.dayRate)) return { rate: toMoney(assignment.dayRate), source: 'override', inherited };
  return { ...inherited, inherited };
}

/**
 * Days and cost: the job days this person is assigned to on the Schedule tab when there are
 * any (each at its own day rate if one's set, else the job rate), otherwise the manually typed
 * "Days" figure, otherwise 1 - so an unscheduled job still costs out, but once days are
 * assigned they win.
 */
export function assignmentCost(
  rate: ResolvedRate,
  scheduledDayRates: (string | null)[],
  manualDays: string | null
): { days: number; fromSchedule: boolean; cost: number; dayOverrides: number } {
  if (rate.source === 'zero') {
    const days = scheduledDayRates.length || toMoney(manualDays) || 1;
    return { days, fromSchedule: scheduledDayRates.length > 0, cost: 0, dayOverrides: 0 };
  }
  if (scheduledDayRates.length > 0) {
    let cost = 0;
    let dayOverrides = 0;
    for (const d of scheduledDayRates) {
      const own = toMoney(d);
      if (own) dayOverrides++;
      cost += own || rate.rate;
    }
    return { days: scheduledDayRates.length, fromSchedule: true, cost, dayOverrides };
  }
  const days = toMoney(manualDays) || 1;
  return { days, fromSchedule: false, cost: rate.rate * days, dayOverrides: 0 };
}

/** The portal-wide fallback rate set on the Users & crew settings page (routes/crew.ts). */
export async function loadGlobalDefaultDayRate(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'defaultCrewDayRate' } });
  if (!setting) return 0;
  try {
    return toMoney((JSON.parse(setting.valueJson) as { dayRate: string | null }).dayRate);
  } catch {
    return 0;
  }
}

export async function loadRateTables(jobId: string): Promise<RateTables> {
  const [rows, defaultRate] = await Promise.all([
    prisma.roleRate.findMany({ where: { OR: [{ jobId }, { jobId: null }] } }),
    loadGlobalDefaultDayRate(),
  ]);
  const job = new Map<string, number>();
  const global = new Map<string, number>();
  for (const r of rows) {
    const amount = toMoney(r.dayRate);
    if (!amount) continue;
    (r.jobId ? job : global).set(r.roleKey, amount);
  }
  return { job, global, defaultRate };
}
