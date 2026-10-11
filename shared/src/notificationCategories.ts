/**
 * Coarse notification categories a person can opt out of individually — one per logical kind
 * of event, derived from the dotted notification `type` strings' prefix (e.g.
 * "crew_assignment.added" -> "crew_assignment"). Stored per-user under prefs.notifications as
 * { [category]: boolean }, missing/true = enabled, false = opted out. Shared so the server
 * (which filters notification creation by this) and the web preferences UI never drift apart.
 */
export const NOTIFICATION_CATEGORIES = [
  'crew_application',
  'crew_label_request',
  'crew_assignment',
  'job_discussion',
  'onboarding',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  crew_application: 'New crew applications',
  crew_label_request: 'Label requests (submitted and reviewed)',
  crew_assignment: "Added to a job's crew",
  job_discussion: 'New discussion messages',
  onboarding: 'New onboarding requests',
};
