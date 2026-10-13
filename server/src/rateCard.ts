import { prisma } from './db';

/**
 * A crew member's "General day rate" rate line and CrewProfile.dayRate are one value: the rate
 * card is what crew edit and the profile field is what the roster and job costing read. These
 * helpers keep the two in step whichever side changes, so the roster never shows 250 while the
 * rate card shows an empty field.
 */
export const GENERAL_RATE_LABEL = 'General day rate';

/** The profile's rate lines, first creating the general line from an older profile dayRate. */
export async function listRateLines(crewProfileId: string) {
  const [profile, lines] = await Promise.all([
    prisma.crewProfile.findUnique({ where: { id: crewProfileId }, select: { dayRate: true } }),
    prisma.crewRateLine.findMany({ where: { crewProfileId }, orderBy: { order: 'asc' } }),
  ]);
  if (profile?.dayRate && !lines.some((l) => l.label === GENERAL_RATE_LABEL)) {
    const created = await prisma.crewRateLine.create({
      data: { crewProfileId, label: GENERAL_RATE_LABEL, amount: profile.dayRate, order: -1 },
    });
    return [created, ...lines];
  }
  return lines;
}

/** Call after any rate-line write: copies the general line (or its absence) to the profile. */
export async function syncProfileDayRate(crewProfileId: string) {
  const general = await prisma.crewRateLine.findFirst({ where: { crewProfileId, label: GENERAL_RATE_LABEL } });
  await prisma.crewProfile.update({ where: { id: crewProfileId }, data: { dayRate: general?.amount ?? null } });
}

/** Call after an admin sets the profile day rate directly: mirrors it onto the rate card. */
export async function syncGeneralRateLine(crewProfileId: string, dayRate: string | null) {
  const general = await prisma.crewRateLine.findFirst({ where: { crewProfileId, label: GENERAL_RATE_LABEL } });
  if (dayRate) {
    if (general) await prisma.crewRateLine.update({ where: { id: general.id }, data: { amount: dayRate } });
    else await prisma.crewRateLine.create({ data: { crewProfileId, label: GENERAL_RATE_LABEL, amount: dayRate, order: -1 } });
  } else if (general) {
    await prisma.crewRateLine.delete({ where: { id: general.id } });
  }
}
