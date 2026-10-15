/** Matches server/src/crewRates.ts's roleKey: roles compare case- and space-insensitively. */
export function roleKeyOf(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, ' ');
}
