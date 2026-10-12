/** Which sections of a job's crew-facing portal page are switched on for that job's crew.
 * Configurable globally (Settings -> Crew Portal Defaults) and overridable per job at
 * onboarding time or later from Job Settings - e.g. a confidential corporate job might turn
 * off Discussion, or a job with no CAD yet might leave Plots off until it's ready. */
export const CREW_FEATURE_KEYS = ['schedule', 'documents', 'plots', 'kitList', 'discussion'] as const;

export type CrewFeatureKey = (typeof CREW_FEATURE_KEYS)[number];
export type CrewFeatures = Record<CrewFeatureKey, boolean>;

export const DEFAULT_CREW_FEATURES: CrewFeatures = {
  schedule: true,
  documents: true,
  plots: true,
  kitList: true,
  discussion: true,
};

export const CREW_FEATURE_LABELS: Record<CrewFeatureKey, string> = {
  schedule: 'Day schedule',
  documents: 'Documents',
  plots: 'CAD / plots',
  kitList: 'Kit list',
  discussion: 'Discussion thread',
};
