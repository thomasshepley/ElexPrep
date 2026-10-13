import { prisma } from './db';

/**
 * One place that decides what a crew member costs per day on a job, and for how many days -
 * used by both the job's Crew tab (routes/jobCrewAssignments.ts) and the admin-only crew
 * margin (routes/currentRms.ts) so the two can never disagree.
 */

/** Matches the label RateCardEditor.tsx gives a crew member's baseline line. */
export const GENERAL_DAY_RATE_LABEL = 'General day rate';

export function toMoney(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface RateLine {
  label: string;
  amount: string;
}

export interface DayRateSource {
  rate: number;
  /** Where the number came from, for the UI's hover hint. */
  source: 'override' | 'role' | 'profile' | 'rateCard' | 'default' | 'none';
}

/**
 * The rate this assignment would use with no job-level override: a rate-card line whose
 * label matches the assignment's role ("Rigger" -> the crew member's own "Rigger" line),
 * then the admin-set profile day rate, then the crew member's "General day rate" line, then
 * the portal-wide default.
 */
export function suggestedDayRate(
  role: string,
  profileDayRate: string | null,
  rateLines: RateLine[],
  globalDefaultRate: number
): DayRateSource {
  const roleKey = role.trim().toLowerCase();
  const roleLine = roleKey ? rateLines.find((l) => l.label.trim().toLowerCase() === roleKey) : undefined;
  if (roleLine && toMoney(roleLine.amount)) return { rate: toMoney(roleLine.amount), source: 'role' };
  if (toMoney(profileDayRate)) return { rate: toMoney(profileDayRate), source: 'profile' };
  const general = rateLines.find((l) => l.label === GENERAL_DAY_RATE_LABEL);
  if (general && toMoney(general.amount)) return { rate: toMoney(general.amount), source: 'rateCard' };
  if (globalDefaultRate) return { rate: globalDefaultRate, source: 'default' };
  return { rate: 0, source: 'none' };
}

export function effectiveDayRate(
  assignment: { role: string; dayRate: string | null; zeroRated: boolean },
  profileDayRate: string | null,
  rateLines: RateLine[],
  globalDefaultRate: number
): DayRateSource & { suggested: DayRateSource } {
  const suggested = suggestedDayRate(assignment.role, profileDayRate, rateLines, globalDefaultRate);
  if (assignment.zeroRated) return { rate: 0, source: 'override', suggested };
  if (toMoney(assignment.dayRate)) return { rate: toMoney(assignment.dayRate), source: 'override', suggested };
  return { ...suggested, suggested };
}

/**
 * Days worked: the job days this person is actually assigned to on the Schedule tab when
 * there are any, otherwise the manually typed "Days" figure, otherwise 1 - so a job that
 * hasn't been scheduled yet still costs out, but once days are assigned they win.
 */
export function effectiveDays(scheduledDayCount: number, manualDays: string | null): { days: number; fromSchedule: boolean } {
  if (scheduledDayCount > 0) return { days: scheduledDayCount, fromSchedule: true };
  return { days: toMoney(manualDays) || 1, fromSchedule: false };
}

/** The portal-wide fallback rate set on the Crew settings page (routes/crew.ts). */
export async function loadGlobalDefaultDayRate(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'defaultCrewDayRate' } });
  if (!setting) return 0;
  try {
    return toMoney((JSON.parse(setting.valueJson) as { dayRate: string | null }).dayRate);
  } catch {
    return 0;
  }
}
