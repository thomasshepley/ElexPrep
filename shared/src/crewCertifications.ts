/** Optional certifications/tickets a crew member may hold - same comma-separated-string
 * storage convention as crewSkills.ts (CrewProfile.certifications / CrewApplication.certifications),
 * shown behind a collapsible section on the application/account forms rather than inline with
 * the always-visible fields, since most people only hold a handful of these. */
export const CREW_CERTIFICATIONS = [
  'IPAF (mobile platforms)',
  'PASMA (mobile towers)',
  'CSCS card',
  'First Aid at Work',
  'Fire Marshal',
  'Manual Handling',
  'IOSH Working Safely',
  'NASC rigging qualification',
  'Forklift license',
  'Full UK driving license',
] as const;

export type CrewCertification = (typeof CREW_CERTIFICATIONS)[number];
