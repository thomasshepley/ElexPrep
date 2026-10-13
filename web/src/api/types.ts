export interface JobSummary {
  startsAt: string | null;
  endsAt: string | null;
  crewCount: number;
  fixtures: number;
  cases: number;
  labelsQueued: number;
  labelsPrinted: number;
}

export interface Job {
  id: string;
  name: string;
  venue: string | null;
  description: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  logoPath: string | null;
  logoPathLeft: string | null;
  logoPathRight: string | null;
  /// Per-slot logo size on the label logo bar, as a percentage of the slot (100 = fit).
  logoScaleLeft: number;
  logoScale: number;
  logoScaleRight: number;
  isPublic: boolean;
  currentRmsOpportunityId: string | null;
  rmsAlertAt: string | null;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
  oneDriveMatchStatus: 'MATCHED' | 'MANUAL' | null;
  crewFeaturesJson: string | null;
  discussionLocked: boolean;
  createdAt: string;
  /** Only on the jobs list response. */
  summary?: JobSummary;
}

export interface FixtureTypeRule {
  id: string;
  name: string;
  unitsPerCase: number;
  caseLabelOverride: string | null;
}

export type LocationColorPattern = 'SOLID' | 'DIAGONAL_STRIPES' | 'RAINBOW';

export interface LocationColorRule {
  id: string;
  location: string;
  color: string;
  pattern: LocationColorPattern;
  secondaryColor: string | null;
}

export interface Fixture {
  id: string;
  address: number | null;
  fixtureType: string;
  mainUniverse: number | null;
  mainAddress: number | null;
  pixUniverse: number | null;
  pixAddress: number | null;
  mode: string | null;
  location: string | null;
  groupId: string | null;
}

export interface FixtureGroup {
  id: string;
  jobId: string;
  name: string;
  order: number;
  rmsGroupName: string | null;
  createdAt: string;
}

export interface RmsHeadingGroup {
  name: string;
  itemNames: string[];
}

export interface PatchImportCandidate {
  id: string;
  fileName: string;
  /// csv | pdf - pdf means the rows were lifted from the CAD PDF via fuzzy table/text
  /// extraction (no patch CSV was found) and deserve extra scrutiny before approval.
  extractedFrom: string;
  oneDriveItemPath: string;
  rowCount: number;
  /// PENDING | APPROVED | REJECTED
  status: string;
  detectedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionNote: string | null;
}

/// A patch import now merges onto existing fixtures rather than wiping them - see
/// routes/patch.ts's mergeFixtures. `matched` is how many existing (addressed) fixtures were
/// updated in place from the new file, `created` is brand-new rows, `removed` is existing
/// addressed fixtures struck from the new file.
export interface PatchImportResult {
  imported: number;
  newFixtureTypes: string[];
  matched: number;
  created: number;
  removed: number;
}

export interface CaseGroup {
  id: string;
  fixtureType: string;
  label: string;
  location: string | null;
  addresses: number[];
  groupId: string | null;
}

export interface PrintQueueItem {
  id: string;
  labelType: string;
  sourceType: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'PRINTED';
  order: number;
  content: Record<string, unknown>;
  groupId: string | null;
}

export interface AdHocLabel {
  id: string;
  labelType: string;
  quantity: number;
  order: number;
  excludeFromPrint: boolean;
  content: Record<string, unknown>;
  /** Set when this label was approved from a crew member's label request. */
  requestedByDisplayName: string | null;
  groupId: string | null;
}

export interface CrewLabelRequest {
  id: string;
  jobId: string;
  labelType: string;
  content: Record<string, unknown>;
  quantity: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
  requestedByDisplayName: string;
}

export interface ActivityLogEntry {
  id: string;
  jobId: string | null;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userName?: string | null;
  userRole?: string | null;
  userIsProjectManager?: boolean;
  jobName?: string | null;
}

export type Role = 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW' | 'WEBMASTER';

export type PermissionKey =
  | 'editJobs'
  | 'managePrepSettings'
  | 'deleteJobs'
  | 'publishJobs'
  | 'linkCurrentRms'
  | 'onboardJobs'
  | 'manageOneDrive'
  | 'manageCrewAssignments'
  | 'manageCrewApplications'
  | 'moderateDiscussion';

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: Record<string, unknown>;
  avatarPath: string | null;
  permissions?: Record<PermissionKey, boolean>;
  /// Set by an admin (the server-side admin CLI's force-password-reset command) - the web
  /// shell blocks everything except a "set a new password" form until this clears, which
  /// happens automatically the moment the password is actually changed.
  mustChangePassword: boolean;
  /// Admin-set "PM" tag - shows this person's name in purple across the site.
  isProjectManager?: boolean;
  /// Both lockdown tiers (see server/src/lockdownMode.ts), surfaced on every authedUserWithPermissions
  /// response so even an about-to-be-blocked account can render the lockdown banner via /auth/me,
  /// the one route the lockdown gate itself exempts.
  developmentLockdown: boolean;
  fullLockdown: boolean;
}

export interface CrewMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  hasAvatar: boolean;
  /// ADMIN means this row is a staff admin's own account also assigned as crew (see
  /// api.crew.fromAdmin), not a freelancer - their login/password lives on the Users page.
  userRole: Role;
  phone: string | null;
  color: string | null;
  skills: string | null;
  certifications: string | null;
  dayRate: string | null;
  notes: string | null;
  gender: string | null;
  address: string | null;
  pronouns: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  otherLinkUrl: string | null;
  hasBankDetails: boolean;
  active: boolean;
  createdAt: string;
}

export interface BankDetails {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  bankName?: string;
}

export interface CrewRateLine {
  id: string;
  crewProfileId: string;
  label: string;
  amount: string;
  order: number;
}

export interface CrewDocumentSummary {
  id: string;
  kind: string;
  originalName: string;
  mimeType: string;
  createdAt: string;
}

export interface CrewApplicationSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  skills: string | null;
  certifications: string | null;
  dayRate: string | null;
  rightToWork: string | null;
  notes: string | null;
  gender: string | null;
  address: string | null;
  hasBankDetails: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
}

export interface CrewApplicationDetail extends CrewApplicationSummary {
  documents: CrewDocumentSummary[];
}

export interface OnboardingInvite {
  id: string;
  fullName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  reviewedAt: string | null;
  createdAt: string;
  /** The signup link token - only present once approved, and only in the admin list response. */
  token: string | null;
}

export type DayRateSource = 'override' | 'role' | 'profile' | 'rateCard' | 'default' | 'none';

export interface JobCrewAssignment {
  id: string;
  crewProfileId: string;
  displayName: string;
  username: string;
  phone: string | null;
  role: string;
  dayRate: string | null;
  profileDayRate: string | null;
  /// How many days this assignment is booked for - null means 1 (see server's JobCrewAssignment
  /// comment). Used to compute this assignment's cost on the admin-only crew margin view.
  days: string | null;
  /// Explicitly costs this assignment at zero regardless of dayRate/profile/global defaults -
  /// distinct from leaving dayRate blank (which means "use the default").
  zeroRated: boolean;
  active: boolean;
  /// The crew member's swatch color (admin override, or a stable id-derived default when
  /// null) - see shared's resolveCrewColor. Used for the day-blocks drag-and-drop chips.
  color: string | null;
  /// What the crew margin actually costs this assignment at, and where that came from - see
  /// server/src/crewRates.ts for the fallback order.
  effectiveDayRate: number;
  dayRateSource: DayRateSource;
  /// The rate with no job-level override (what clearing the override would fall back to).
  suggestedDayRate: number;
  suggestedDayRateSource: DayRateSource;
  /// Job days this person is assigned to on the Schedule tab; when > 0 it drives the cost.
  scheduledDays: number;
  effectiveDays: number;
}

export interface JobDayCrew {
  /// The JobDayCrewAssignment id - the drag-and-drop link record itself, not the crew member.
  id: string;
  jobCrewAssignmentId: string;
  crewProfileId: string;
  displayName: string;
  role: string;
  color: string | null;
}

export interface JobDay {
  id: string;
  date: string;
  crew: JobDayCrew[];
}

export interface BugReportAction {
  time: string;
  type: string;
  description: string;
}

/// A self-submitted bug report - see server/src/routes/bugReports.ts. Only ever fetched by the
/// WEBMASTER-only Webmaster page; the submit endpoint itself is open to any signed-in account.
export interface BugReport {
  id: string;
  reporterName: string;
  reporterRole: string;
  pageUrl: string;
  pageTitle: string | null;
  userAgent: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  recentActions: BugReportAction[];
  notes: string | null;
  createdAt: string;
}

export interface CrewMe {
  id: string;
  displayName: string;
  phone: string | null;
  skills: string | null;
  certifications: string | null;
  notes: string | null;
  dayRate: string | null;
  gender: string | null;
  address: string | null;
  pronouns: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  otherLinkUrl: string | null;
  hasBankDetails: boolean;
}

export interface CrewScheduleSwatch {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface CrewMyJob {
  jobId: string;
  jobName: string;
  venue: string | null;
  address: string | null;
  role: string;
  /** The next day (from today) this person is booked on, or null. Items are the entries they're
   * on that day (every entry that day when they're on none specifically). */
  nextDay: {
    date: string;
    items: { title: string; startsAt: string; endsAt: string | null }[];
    others: { name: string; role: string }[];
  } | null;
  startsAt: string | null;
  endsAt: string | null;
  crew: CrewScheduleSwatch[];
}

export interface CrewJobDetail {
  jobId: string;
  who: {
    you: { role: string };
    others: { displayName: string; role: string }[];
  };
  what: {
    jobName: string;
    description: string | null;
  };
  when: {
    startsAt: string | null;
    endsAt: string | null;
  };
  where: {
    venue: string | null;
    address: string | null;
  };
}

export interface Plot {
  id: string;
  jobId: string;
  originalName: string;
  createdAt: string;
}

export type PrintMethod = 'DRY_RUN' | 'DIRECT_9100' | 'AGENT';
export type TrayKey = 'TRAY1' | 'TRAY2' | 'BYPASS';

export interface PrinterSettings {
  method: PrintMethod;
  direct: { host: string; port: number };
  agent: { printerName: string; token: string };
  trays: Record<TrayKey, { label: string; pjl: string; bin: string }>;
  typeToTray: Record<string, TrayKey>;
}

export interface PrintJob {
  id: string;
  jobId: string;
  labelType: string;
  tray: string;
  method: string;
  status: 'QUEUED' | 'CLAIMED' | 'SENT' | 'DONE' | 'FAILED' | 'CANCELLED';
  error: string | null;
  pages: number;
  createdAt: string;
}

export interface CurrentRmsConfig {
  enabled: boolean;
  subdomain: string;
  hasApiKey: boolean;
  pollMinutes: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface CurrentRmsOpportunity {
  id: string;
  rmsId: number;
  subject: string;
  status: string | null;
  kind: 'QUOTE' | 'ORDER' | 'OTHER' | null;
  memberName: string | null;
  value: number | null;
  startsAt: string | null;
  endsAt: string | null;
  rmsUpdatedAt: string | null;
  syncedAt: string;
}

export interface OneDriveConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  hasClientSecret: boolean;
  rootFolderPath: string;
  driveId: string;
  lastTestError: string | null;
}

export interface OneDriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
}

export interface OneDriveShare {
  id: string;
  jobId: string;
  itemId: string;
  itemName: string;
  itemPath: string;
  isFolder: boolean;
  isCadPlot: boolean;
  sharedAt: string;
}

export interface JobOneDriveStatus {
  enabled: boolean;
  folderId: string | null;
  folderPath: string | null;
  matchStatus: 'MATCHED' | 'MANUAL' | null;
  cadPdf: { itemId: string; name: string } | null;
  shares: OneDriveShare[];
}

export interface JobScheduleItem {
  id: string;
  jobId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  notes: string | null;
  color: string | null;
  crew: JobDayCrew[];
}

export interface JobDocument {
  id: string;
  jobId: string;
  originalName: string;
  mimeType: string;
  createdAt: string;
}

export interface JobContact {
  id: string;
  jobId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
}

export interface KitListItem {
  id: number;
  name: string;
  quantity: number;
}

export interface DashboardOrder {
  jobId: string;
  jobName: string;
  venue: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  value: number | null;
  crewCount: number;
  crew: CrewScheduleSwatch[];
}

export interface DashboardDay {
  id: string;
  date: string;
  jobId: string;
  jobName: string;
  venue: string | null;
  crew: CrewScheduleSwatch[];
  items: { id: string; title: string; startsAt: string; endsAt: string | null }[];
}

export interface DashboardFailedPrint {
  id: string;
  jobId: string;
  jobName: string;
  labelType: string;
  error: string | null;
  createdAt: string;
}

export interface DashboardData {
  orders: DashboardOrder[];
  thisWeek: DashboardDay[];
  failedPrints: DashboardFailedPrint[];
}

export interface DiscussionMessage {
  id: string;
  jobId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  authorIsProjectManager?: boolean;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
}

export interface DiscussionThreadData {
  locked: boolean;
  messages: DiscussionMessage[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CurrentRmsPickItem {
  id: number;
  name?: string;
  product_name?: string;
  description?: string;
  quantity?: number;
  status_name?: string;
  prepped?: boolean;
  bookedOut?: boolean;
  /** A Current RMS section-heading row (e.g. "Lighting - Moving Lights"), not a real item. */
  isGroup?: boolean;
  /** Current RMS's own classification - "Rental", "Sale", or "Service". */
  transaction_type_name?: string;
  /** 0 = Group, 1 = Principal, 2 = Accessory. An Accessory row often carries no
   * transaction_type_name of its own - see isNonRental in CurrentRmsPanel, which inherits it
   * from the nearest preceding Principal row instead of treating a blank as "Rental". */
  opportunity_item_type?: number;
  [key: string]: unknown;
}

export interface LoginRequiresTotp {
  requiresTotp: true;
  pendingToken: string;
}
