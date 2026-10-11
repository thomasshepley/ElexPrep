/** Fixed taxonomy for crew skills/roles — used by both the public application form and the
 * admin crew roster, so the two never drift apart (same pattern as AD_HOC_TYPES for labels). */
export const CREW_SKILLS = [
  'Lighting Designer',
  'Programmer',
  'Rigger',
  'Spot Operator',
  'Truss Technician',
  'Electrician',
  'Audio Engineer',
  'Video Engineer',
  'Production Manager',
  'Driver',
  'Rope Access / IRATA',
  'Pyrotechnics',
] as const;

export type CrewSkill = (typeof CREW_SKILLS)[number];

/**
 * Skills are stored as one comma-separated string (CrewProfile.skills / CrewApplication.skills)
 * for backward compatibility with the free-text field this replaces in the UI. These helpers
 * split/join against that format. Anything not in CREW_SKILLS is preserved as free-text rather
 * than dropped, so existing records never lose data when edited through the new picker.
 */
export function parseSkills(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatSkills(skills: string[]): string {
  return skills.join(', ');
}
