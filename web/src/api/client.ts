import type { PickListDiff, LabelElementDef, LabelTypeTemplate, CrewFeatures } from '@elexprep/shared';
export type { LabelElementDef, LabelTypeTemplate, TextElementDef, StackedTextElementDef, FillElementDef, ImageElementDef } from '@elexprep/shared';
export type { CrewFeatures, CrewFeatureKey } from '@elexprep/shared';
export { CREW_FEATURE_KEYS, CREW_FEATURE_LABELS, DEFAULT_CREW_FEATURES } from '@elexprep/shared';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Registered by AuthProvider so a 401 from any call bounces the app to the login screen. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers:
      init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
  });
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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
  isPublic: boolean;
  currentRmsOpportunityId: string | null;
  rmsAlertAt: string | null;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
  oneDriveMatchStatus: 'MATCHED' | 'MANUAL' | null;
  crewFeaturesJson: string | null;
  discussionLocked: boolean;
  createdAt: string;
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
  jobName?: string | null;
}

export type Role = 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW' | 'WEBMASTER';

export type PermissionKey =
  | 'deleteJobs'
  | 'publishJobs'
  | 'viewActivityLog'
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
  role: string;
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

export interface DiscussionMessage {
  id: string;
  jobId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
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

export const api = {
  version: {
    get: () =>
      request<{ version: string; changelog: { version: string; date: string; notes: string[] }[] }>('/version'),
  },
  auth: {
    status: () => request<{ needsSetup: boolean }>('/auth/status'),
    setup: (data: { username: string; password: string; displayName?: string }) =>
      request<AuthedUser>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { username: string; password: string }) =>
      request<AuthedUser | LoginRequiresTotp>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    verifyTotp: (data: { pendingToken: string; code?: string; backupCode?: string }) =>
      request<AuthedUser>('/auth/login/verify-2fa', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<AuthedUser>('/auth/me'),
    updateMe: (data: {
      displayName?: string;
      password?: string;
      currentPassword?: string;
      prefs?: Record<string, unknown>;
    }) => request<AuthedUser>('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
    uploadAvatar: async (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      return request<AuthedUser>('/auth/me/avatar', { method: 'POST', body: form });
    },
    removeAvatar: () => request<AuthedUser>('/auth/me/avatar', { method: 'DELETE' }),
    avatarUrl: (userId: string) => `${BASE}/auth/users/${userId}/avatar`,
  },
  twoFactor: {
    status: () => request<{ enabled: boolean; verifiedAt: string | null; backupCodesRemaining: number }>('/2fa/status'),
    setup: () => request<{ secret: string; otpauthUrl: string }>('/2fa/setup', { method: 'POST' }),
    confirm: (data: { secret: string; code: string }) =>
      request<{ backupCodes: string[] }>('/2fa/confirm', { method: 'POST', body: JSON.stringify(data) }),
    disable: (password: string) => request<void>('/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) }),
    regenerateBackupCodes: (password: string) =>
      request<{ backupCodes: string[] }>('/2fa/backup-codes/regenerate', { method: 'POST', body: JSON.stringify({ password }) }),
  },
  users: {
    list: () => request<AuthedUser[]>('/users'),
    create: (data: { username: string; password: string; displayName?: string; role?: Role }) =>
      request<AuthedUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ displayName: string; role: Role; password: string }>) =>
      request<AuthedUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  crew: {
    list: () => request<CrewMember[]>('/crew'),
    adminCandidates: () => request<{ id: string; username: string; displayName: string }[]>('/crew/admin-candidates'),
    fromAdmin: (userId: string) => request<CrewMember>('/crew/from-admin', { method: 'POST', body: JSON.stringify({ userId }) }),
    create: (data: {
      username: string;
      password: string;
      displayName?: string;
      phone?: string;
      color?: string;
      skills?: string;
      certifications?: string;
      dayRate?: string;
      notes?: string;
      gender?: string;
      address?: string;
      pronouns?: string;
      instagramUrl?: string;
      facebookUrl?: string;
      otherLinkUrl?: string;
      bankDetails?: BankDetails;
    }) => request<CrewMember>('/crew', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{
        displayName: string;
        password: string;
        phone: string;
        color: string;
        skills: string;
        certifications: string;
        dayRate: string;
        notes: string;
        gender: string;
        address: string;
        pronouns: string;
        instagramUrl: string;
        facebookUrl: string;
        otherLinkUrl: string;
        bankDetails: BankDetails;
        active: boolean;
      }>
    ) => request<CrewMember>(`/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/crew/${id}`, { method: 'DELETE' }),
    bankDetails: (id: string) => request<BankDetails>(`/crew/${id}/bank-details`),
    documents: {
      list: (crewId: string) => request<CrewDocumentSummary[]>(`/crew/${crewId}/documents`),
      upload: (crewId: string, form: FormData) =>
        request<CrewDocumentSummary[]>(`/crew/${crewId}/documents`, { method: 'POST', body: form }),
      url: (crewId: string, docId: string) => `${BASE}/crew/${crewId}/documents/${docId}`,
      remove: (crewId: string, docId: string) =>
        request<void>(`/crew/${crewId}/documents/${docId}`, { method: 'DELETE' }),
    },
    rateLines: {
      list: (crewId: string) => request<CrewRateLine[]>(`/crew/${crewId}/rate-lines`),
      create: (crewId: string, data: { label: string; amount: string }) =>
        request<CrewRateLine>(`/crew/${crewId}/rate-lines`, { method: 'POST', body: JSON.stringify(data) }),
      update: (crewId: string, lineId: string, data: Partial<{ label: string; amount: string }>) =>
        request<CrewRateLine>(`/crew/${crewId}/rate-lines/${lineId}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (crewId: string, lineId: string) =>
        request<void>(`/crew/${crewId}/rate-lines/${lineId}`, { method: 'DELETE' }),
    },
    getDefaultRate: () => request<{ dayRate: string | null }>('/crew/default-rate'),
    setDefaultRate: (dayRate: string | null) =>
      request<{ dayRate: string | null }>('/crew/default-rate', { method: 'PUT', body: JSON.stringify({ dayRate }) }),
  },
  crewApplications: {
    submit: (form: FormData) => request<{ id: string }>('/crew-applications', { method: 'POST', body: form }),
    list: (status?: string) =>
      request<CrewApplicationSummary[]>(`/crew-applications${status ? `?status=${status}` : ''}`),
    get: (id: string) => request<CrewApplicationDetail>(`/crew-applications/${id}`),
    documentUrl: (appId: string, docId: string) => `${BASE}/crew-applications/${appId}/documents/${docId}`,
    bankDetails: (id: string) => request<BankDetails>(`/crew-applications/${id}/bank-details`),
    approve: (id: string, data: { username: string; password: string; displayName?: string }) =>
      request<{ userId: string; crewProfileId: string; username: string }>(`/crew-applications/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reject: (id: string, note?: string) =>
      request<void>(`/crew-applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  onboarding: {
    submit: (fullName: string) => request<{ id: string }>('/onboarding', { method: 'POST', body: JSON.stringify({ fullName }) }),
    list: (status?: string) => request<OnboardingInvite[]>(`/onboarding${status ? `?status=${status}` : ''}`),
    approve: (id: string) => request<OnboardingInvite>(`/onboarding/${id}/approve`, { method: 'POST' }),
    reject: (id: string) => request<void>(`/onboarding/${id}/reject`, { method: 'POST' }),
    invite: {
      get: (token: string) => request<{ fullName: string; status: string }>(`/onboarding/invite/${token}`),
      complete: (
        token: string,
        data: {
          username: string;
          password: string;
          displayName?: string;
          phone?: string;
          skills?: string;
          certifications?: string;
          gender?: string;
          address?: string;
          dayRate?: string;
          notes?: string;
          bankDetails?: BankDetails;
        }
      ) => request<{ userId: string; username: string }>(`/onboarding/invite/${token}/complete`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  crewPortal: {
    me: () => request<CrewMe>('/crew/me'),
    updateMe: (
      data: Partial<{
        phone: string;
        skills: string;
        certifications: string;
        notes: string;
        gender: string;
        address: string;
        pronouns: string;
        instagramUrl: string;
        facebookUrl: string;
        otherLinkUrl: string;
        bankDetails: BankDetails;
      }>
    ) => request<CrewMe>('/crew/me', { method: 'PUT', body: JSON.stringify(data) }),
    bankDetails: () => request<BankDetails>('/crew/me/bank-details'),
    rateLines: {
      list: () => request<CrewRateLine[]>('/crew/me/rate-lines'),
      create: (data: { label: string; amount: string }) =>
        request<CrewRateLine>('/crew/me/rate-lines', { method: 'POST', body: JSON.stringify(data) }),
      update: (lineId: string, data: Partial<{ label: string; amount: string }>) =>
        request<CrewRateLine>(`/crew/me/rate-lines/${lineId}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (lineId: string) => request<void>(`/crew/me/rate-lines/${lineId}`, { method: 'DELETE' }),
    },
    myJobs: () => request<CrewMyJob[]>('/crew/me/jobs'),
    jobDetail: (jobId: string) => request<CrewJobDetail>(`/crew/me/jobs/${jobId}`),
    schedule: (jobId: string) => request<JobScheduleItem[]>(`/crew/me/jobs/${jobId}/schedule`),
    days: (jobId: string) => request<JobDay[]>(`/crew/me/jobs/${jobId}/days`),
    kitList: (jobId: string) => request<{ items: KitListItem[] }>(`/crew/me/jobs/${jobId}/kit-list`),
    documents: (jobId: string) => request<JobDocument[]>(`/crew/me/jobs/${jobId}/documents`),
    documentUrl: (jobId: string, docId: string) => `${BASE}/crew/me/jobs/${jobId}/documents/${docId}/file`,
    contacts: (jobId: string) => request<JobContact[]>(`/crew/me/jobs/${jobId}/contacts`),
    plots: (jobId: string) => request<Plot[]>(`/crew/me/jobs/${jobId}/plots`),
    plotUrl: (jobId: string, plotId: string) => `${BASE}/crew/me/jobs/${jobId}/plots/${plotId}/file`,
    oneDrive: (jobId: string) =>
      request<{ cadPdf: { itemId: string; name: string } | null; shared: OneDriveShare[] }>(`/crew/me/jobs/${jobId}/onedrive`),
    oneDriveFileUrl: (jobId: string, itemId: string) => `${BASE}/crew/me/jobs/${jobId}/onedrive/${itemId}/file`,
    submitLabelRequest: (jobId: string, data: { labelType: string; content: Record<string, unknown>; quantity?: number }) =>
      request<CrewLabelRequest>(`/crew/me/jobs/${jobId}/label-requests`, { method: 'POST', body: JSON.stringify(data) }),
    discussion: {
      list: (jobId: string) => request<DiscussionThreadData>(`/crew/me/jobs/${jobId}/discussion`),
      send: (jobId: string, body: string) =>
        request<DiscussionMessage>(`/crew/me/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body }) }),
      edit: (jobId: string, messageId: string, body: string) =>
        request<DiscussionMessage>(`/crew/me/jobs/${jobId}/discussion/${messageId}`, { method: 'PUT', body: JSON.stringify({ body }) }),
      remove: (jobId: string, messageId: string) =>
        request<void>(`/crew/me/jobs/${jobId}/discussion/${messageId}`, { method: 'DELETE' }),
    },
  },
  labelRequests: {
    list: (jobId: string, status?: string) =>
      request<CrewLabelRequest[]>(`/jobs/${jobId}/label-requests${status ? `?status=${status}` : ''}`),
    approve: (jobId: string, id: string) =>
      request<AdHocLabel>(`/jobs/${jobId}/label-requests/${id}/approve`, { method: 'POST' }),
    reject: (jobId: string, id: string, note?: string) =>
      request<void>(`/jobs/${jobId}/label-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  jobSchedule: {
    list: (jobId: string) => request<JobScheduleItem[]>(`/jobs/${jobId}/schedule`),
    create: (jobId: string, data: { title: string; startsAt: string; endsAt?: string; notes?: string; color?: string }) =>
      request<JobScheduleItem>(`/jobs/${jobId}/schedule`, { method: 'POST', body: JSON.stringify(data) }),
    update: (
      jobId: string,
      id: string,
      data: Partial<{ title: string; startsAt: string; endsAt: string | null; notes: string; color: string | null }>
    ) => request<JobScheduleItem>(`/jobs/${jobId}/schedule/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/schedule/${id}`, { method: 'DELETE' }),
    assignCrew: (jobId: string, itemId: string, jobCrewAssignmentId: string, dayDate: string) =>
      request<{ id: string }>(`/jobs/${jobId}/schedule/${itemId}/crew`, {
        method: 'POST',
        body: JSON.stringify({ jobCrewAssignmentId, dayDate }),
      }),
    unassignCrew: (jobId: string, itemId: string, id: string) =>
      request<void>(`/jobs/${jobId}/schedule/${itemId}/crew/${id}`, { method: 'DELETE' }),
  },
  jobDays: {
    list: (jobId: string) => request<JobDay[]>(`/jobs/${jobId}/days`),
    create: (jobId: string, date: string) =>
      request<JobDay>(`/jobs/${jobId}/days`, { method: 'POST', body: JSON.stringify({ date }) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/days/${id}`, { method: 'DELETE' }),
    assignCrew: (jobId: string, dayId: string, jobCrewAssignmentId: string) =>
      request<{ id: string }>(`/jobs/${jobId}/days/${dayId}/crew`, {
        method: 'POST',
        body: JSON.stringify({ jobCrewAssignmentId }),
      }),
    unassignCrew: (jobId: string, dayId: string, id: string) =>
      request<void>(`/jobs/${jobId}/days/${dayId}/crew/${id}`, { method: 'DELETE' }),
  },
  bugReports: {
    submit: (data: {
      pageUrl: string;
      pageTitle?: string;
      userAgent?: string;
      viewportWidth?: number;
      viewportHeight?: number;
      recentActions?: { time: string; type: string; description: string }[];
      notes?: string;
    }) => request<{ ok: boolean }>('/bug-reports', { method: 'POST', body: JSON.stringify(data) }),
    list: () => request<BugReport[]>('/bug-reports'),
    remove: (id: string) => request<void>(`/bug-reports/${id}`, { method: 'DELETE' }),
  },
  jobDiscussion: {
    list: (jobId: string) => request<DiscussionThreadData>(`/jobs/${jobId}/discussion`),
    send: (jobId: string, body: string) =>
      request<DiscussionMessage>(`/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body }) }),
    edit: (jobId: string, messageId: string, body: string) =>
      request<DiscussionMessage>(`/jobs/${jobId}/discussion/${messageId}`, { method: 'PUT', body: JSON.stringify({ body }) }),
    remove: (jobId: string, messageId: string) => request<void>(`/jobs/${jobId}/discussion/${messageId}`, { method: 'DELETE' }),
    setLocked: (jobId: string, locked: boolean) =>
      request<{ locked: boolean }>(`/jobs/${jobId}/discussion-lock`, { method: 'PUT', body: JSON.stringify({ locked }) }),
  },
  jobDocuments: {
    list: (jobId: string) => request<JobDocument[]>(`/jobs/${jobId}/documents`),
    upload: async (jobId: string, file: File) => {
      const form = new FormData();
      form.append('document', file);
      return request<JobDocument>(`/jobs/${jobId}/documents`, { method: 'POST', body: form });
    },
    fileUrl: (jobId: string, id: string) => `${BASE}/jobs/${jobId}/documents/${id}/file`,
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/documents/${id}`, { method: 'DELETE' }),
  },
  jobContacts: {
    list: (jobId: string) => request<JobContact[]>(`/jobs/${jobId}/contacts`),
    create: (jobId: string, data: { name: string; role?: string; phone?: string; email?: string; notes?: string }) =>
      request<JobContact>(`/jobs/${jobId}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
    update: (
      jobId: string,
      id: string,
      data: Partial<{ name: string; role: string; phone: string; email: string; notes: string }>
    ) => request<JobContact>(`/jobs/${jobId}/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/contacts/${id}`, { method: 'DELETE' }),
  },
  dashboard: {
    get: () => request<{ orders: DashboardOrder[] }>('/dashboard'),
  },
  notifications: {
    list: () => request<AppNotification[]>('/notifications'),
    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
  },
  jobCrewAssignments: {
    list: (jobId: string) => request<JobCrewAssignment[]>(`/jobs/${jobId}/crew`),
    create: (jobId: string, data: { crewProfileId: string; role: string; dayRate?: string; days?: string; zeroRated?: boolean }) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ role: string; dayRate: string; days: string; zeroRated: boolean }>) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/crew/${id}`, { method: 'DELETE' }),
  },
  jobCrewMargin: {
    get: (jobId: string) =>
      request<{
        chargeTotal: number;
        chargeBreakdown: {
          opportunityId: number;
          subject: string;
          serviceCharge: number;
          lines: { name: string; quantity: number; rate: number; total: number }[];
        }[];
        costTotal: number;
        costBreakdown: {
          crewProfileId: string;
          name: string;
          role: string;
          dayRate: number;
          suggestedRate: number;
          zeroRated: boolean;
          days: number;
          cost: number;
        }[];
        margin: number;
        marginPercent: number | null;
      }>(`/jobs/${jobId}/current-rms/crew-margin`),
  },
  jobLinkedRmsOpportunities: {
    list: (jobId: string) =>
      request<{ id: string; rmsId: number; subject: string | null; createdAt: string }[]>(
        `/jobs/${jobId}/current-rms/linked-opportunities`
      ),
    create: (jobId: string, rmsId: number) =>
      request<{ id: string; rmsId: number; subject: string | null; createdAt: string }>(
        `/jobs/${jobId}/current-rms/linked-opportunities`,
        { method: 'POST', body: JSON.stringify({ rmsId }) }
      ),
    remove: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/current-rms/linked-opportunities/${id}`, { method: 'DELETE' }),
  },
  permissions: {
    get: () =>
      request<{ permissions: Record<PermissionKey, boolean>; keys: PermissionKey[]; labels: Record<PermissionKey, string> }>(
        '/permissions'
      ),
    update: (permissions: Partial<Record<PermissionKey, boolean>>) =>
      request<{ permissions: Record<PermissionKey, boolean> }>('/permissions', {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    getUser: (userId: string) =>
      request<{
        permissions: Record<PermissionKey, boolean>;
        override: Partial<Record<PermissionKey, boolean>> | null;
        keys: PermissionKey[];
        labels: Record<PermissionKey, string>;
      }>(`/permissions/users/${userId}`),
    updateUser: (userId: string, permissions: Partial<Record<PermissionKey, boolean>> | null) =>
      request<{ permissions: Record<PermissionKey, boolean> }>(`/permissions/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
  },
  settings: {
    get: <T>(key: string) => request<{ key: string; value: T | null }>(`/settings/${key}`),
    put: <T>(key: string, value: T) =>
      request<{ key: string; value: T }>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  },
  plots: {
    list: (jobId: string) => request<Plot[]>(`/jobs/${jobId}/plots`),
    upload: async (jobId: string, file: File) => {
      const form = new FormData();
      form.append('plot', file);
      return request<Plot>(`/jobs/${jobId}/plots`, { method: 'POST', body: form });
    },
    fileUrl: (jobId: string, id: string) => `${BASE}/jobs/${jobId}/plots/${id}/file`,
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/plots/${id}`, { method: 'DELETE' }),
  },
  jobs: {
    list: () => request<Job[]>('/jobs'),
    get: (id: string) => request<Job>(`/jobs/${id}`),
    update: (
      id: string,
      data: Partial<Pick<Job, 'name' | 'venue' | 'description' | 'address' | 'startsAt' | 'endsAt' | 'isPublic'>> & {
        crewFeatures?: Partial<CrewFeatures> | null;
      }
    ) => request<Job>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
    uploadLogo: async (id: string, file: File, slot: 'left' | 'middle' | 'right' = 'middle') => {
      const form = new FormData();
      form.append('logo', file);
      return request<Job>(`/jobs/${id}/logo/${slot}`, { method: 'POST', body: form });
    },
    removeLogo: (id: string, slot: 'left' | 'middle' | 'right' = 'middle') =>
      request<Job>(`/jobs/${id}/logo/${slot}`, { method: 'DELETE' }),
    logoUrl: (id: string, slot: 'left' | 'middle' | 'right' = 'middle') => `${BASE}/jobs/${id}/logo/${slot}`,
    logoOneDriveCandidate: (id: string) => request<{ itemId: string; name: string } | null>(`/jobs/${id}/logo/onedrive-candidate`),
    applyLogoOneDriveCandidate: (id: string, slot: 'left' | 'middle' | 'right' = 'middle') =>
      request<Job>(`/jobs/${id}/logo/onedrive-candidate/apply`, { method: 'POST', body: JSON.stringify({ slot }) }),
  },
  fixtureTypeRules: {
    list: () => request<FixtureTypeRule[]>('/fixture-type-rules'),
    create: (data: { name: string; unitsPerCase: number; caseLabelOverride?: string }) =>
      request<FixtureTypeRule>('/fixture-type-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; unitsPerCase: number; caseLabelOverride: string }>) =>
      request<FixtureTypeRule>(`/fixture-type-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/fixture-type-rules/${id}`, { method: 'DELETE' }),
  },
  locationColorRules: {
    list: () => request<LocationColorRule[]>('/location-color-rules'),
    create: (data: { location: string; color: string; pattern?: LocationColorPattern; secondaryColor?: string }) =>
      request<LocationColorRule>('/location-color-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{ location: string; color: string; pattern: LocationColorPattern; secondaryColor: string | null }>
    ) => request<LocationColorRule>(`/location-color-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/location-color-rules/${id}`, { method: 'DELETE' }),
  },
  jobLocationColorRules: {
    list: (jobId: string) => request<LocationColorRule[]>(`/jobs/${jobId}/location-colors`),
    create: (
      jobId: string,
      data: { location: string; color: string; pattern?: LocationColorPattern; secondaryColor?: string }
    ) => request<LocationColorRule>(`/jobs/${jobId}/location-colors`, { method: 'POST', body: JSON.stringify(data) }),
    update: (
      jobId: string,
      id: string,
      data: Partial<{ location: string; color: string; pattern: LocationColorPattern; secondaryColor: string | null }>
    ) => request<LocationColorRule>(`/jobs/${jobId}/location-colors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/location-colors/${id}`, { method: 'DELETE' }),
  },
  patch: {
    preview: async (jobId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<{
        headers: string[];
        rows: Record<string, string>[];
        fieldKeys: string[];
        savedMapping: Record<string, string> | null;
        missingColumns: { field: string; column: string }[];
      }>(`/jobs/${jobId}/patch/preview`, { method: 'POST', body: form });
    },
    import: (jobId: string, rows: Record<string, string>[], mapping?: Record<string, string>, groupId?: string | null) =>
      request<PatchImportResult>(`/jobs/${jobId}/patch/import`, {
        method: 'POST',
        body: JSON.stringify({ ...(mapping ? { mapping } : {}), rows, groupId: groupId ?? null }),
      }),
    fixtures: (jobId: string) => request<Fixture[]>(`/jobs/${jobId}/fixtures`),
    updateFixture: (jobId: string, id: string, data: Partial<Omit<Fixture, 'id'>>) =>
      request<Fixture>(`/jobs/${jobId}/fixtures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeFixture: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/fixtures/${id}`, { method: 'DELETE' }),
    bulkSetLocation: (jobId: string, ids: string[], location: string) =>
      request<{ updated: number }>(`/jobs/${jobId}/fixtures/bulk`, { method: 'PUT', body: JSON.stringify({ ids, location }) }),
    bulkRemoveFixtures: (jobId: string, ids: string[]) =>
      request<{ deleted: number }>(`/jobs/${jobId}/fixtures/bulk`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
    scanOneDrive: (jobId: string) =>
      request<{ detected: boolean; candidate?: PatchImportCandidate }>(`/jobs/${jobId}/patch/onedrive-scan`, { method: 'POST' }),
    getOneDriveCandidate: (jobId: string) =>
      request<PatchImportCandidate | null>(`/jobs/${jobId}/patch/onedrive-candidate`),
    approveOneDriveCandidate: (jobId: string) =>
      request<PatchImportResult & { candidate: PatchImportCandidate }>(
        `/jobs/${jobId}/patch/onedrive-candidate/approve`,
        { method: 'POST' }
      ),
    rejectOneDriveCandidate: (jobId: string, note?: string) =>
      request<{ candidate: PatchImportCandidate }>(`/jobs/${jobId}/patch/onedrive-candidate/reject`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
  },
  cases: {
    generate: (jobId: string, groupId?: string | null) =>
      request<{ generated: number }>(`/jobs/${jobId}/cases/generate`, { method: 'POST', body: JSON.stringify({ groupId: groupId ?? null }) }),
    list: (jobId: string) => request<CaseGroup[]>(`/jobs/${jobId}/cases`),
    create: (jobId: string, data: { fixtureType: string; label: string; location?: string; addresses?: number[]; groupId?: string | null }) =>
      request<CaseGroup>(`/jobs/${jobId}/cases`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ fixtureType: string; label: string; location: string; groupId: string | null }>) =>
      request<CaseGroup>(`/jobs/${jobId}/cases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/cases/${id}`, { method: 'DELETE' }),
    bulkSetLocation: (jobId: string, ids: string[], location: string) =>
      request<{ updated: number }>(`/jobs/${jobId}/cases/bulk`, { method: 'PUT', body: JSON.stringify({ ids, location }) }),
    bulkRemove: (jobId: string, ids: string[]) =>
      request<{ deleted: number }>(`/jobs/${jobId}/cases/bulk`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
  },
  adHocLabels: {
    list: (jobId: string) => request<AdHocLabel[]>(`/jobs/${jobId}/adhoc-labels`),
    create: (jobId: string, data: { labelType: string; content: Record<string, unknown>; quantity: number; groupId?: string | null }) =>
      request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels`, { method: 'POST', body: JSON.stringify(data) }),
    update: (
      jobId: string,
      id: string,
      data: Partial<{ content: Record<string, unknown>; quantity: number; excludeFromPrint: boolean; groupId: string | null }>
    ) => request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/adhoc-labels/${id}`, { method: 'DELETE' }),
  },
  fixtureGroups: {
    list: (jobId: string) => request<FixtureGroup[]>(`/jobs/${jobId}/fixture-groups`),
    create: (jobId: string, name: string) =>
      request<FixtureGroup>(`/jobs/${jobId}/fixture-groups`, { method: 'POST', body: JSON.stringify({ name }) }),
    update: (jobId: string, id: string, data: Partial<{ name: string; order: number }>) =>
      request<FixtureGroup>(`/jobs/${jobId}/fixture-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/fixture-groups/${id}`, { method: 'DELETE' }),
    rmsHeadings: (jobId: string) => request<RmsHeadingGroup[]>(`/jobs/${jobId}/fixture-groups/rms-headings`),
    createFromRms: (jobId: string, names: string[]) =>
      request<{ groups: { id: string; name: string; matched: number }[]; totalMatched: number }>(
        `/jobs/${jobId}/fixture-groups/from-rms`,
        { method: 'POST', body: JSON.stringify({ names }) }
      ),
    rematch: (jobId: string, id: string) =>
      request<{ matched: number }>(`/jobs/${jobId}/fixture-groups/${id}/rematch`, { method: 'POST' }),
  },
  printQueue: {
    build: (jobId: string, opts: { includeFixtureLabels?: boolean; includePalLabels?: boolean }) =>
      request<{ created: number }>(`/jobs/${jobId}/print-queue/build`, {
        method: 'POST',
        body: JSON.stringify(opts),
      }),
    list: (jobId: string) => request<{ queue: PrintQueueItem[]; adHoc: AdHocLabel[] }>(`/jobs/${jobId}/print-queue`),
    updateItem: (jobId: string, id: string, data: Partial<{ quantity: number; content: Record<string, unknown> }>) =>
      request<PrintQueueItem>(`/jobs/${jobId}/print-queue/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeItem: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/print-queue/${id}`, { method: 'DELETE' }),
    reorder: (jobId: string, labelType: string, items: { source: 'queue' | 'adhoc'; id: string }[]) =>
      request<{ reordered: number }>(`/jobs/${jobId}/print-queue/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ labelType, items }),
      }),
    confirm: (jobId: string, ids: string[], override = false) =>
      request<{ confirmed: number }>(`/jobs/${jobId}/print-queue/confirm`, {
        method: 'POST',
        body: JSON.stringify({ ids, override }),
      }),
    pdfUrl: (jobId: string) => `${BASE}/jobs/${jobId}/print-queue/pdf`,
    previewUrl: (jobId: string) => `${BASE}/jobs/${jobId}/print-queue/preview.pdf`,
    palAveryPdfUrl: (jobId: string) => `${BASE}/jobs/${jobId}/print-queue/pal/avery.pdf`,
    send: (jobId: string) =>
      request<{ printJobs: PrintJob[] }>(`/jobs/${jobId}/print-queue/send`, { method: 'POST' }),
    printerConfig: (jobId: string) =>
      request<{ printer: string; trayMap: Record<string, string>; method: PrintMethod }>(
        `/jobs/${jobId}/printer-config`
      ),
  },
  labelTemplates: {
    get: (jobId: string, labelType: string) =>
      request<{ template: LabelTypeTemplate; isCustomized: boolean }>(`/jobs/${jobId}/label-templates/${labelType}`),
    update: (jobId: string, labelType: string, elements: Record<string, Partial<LabelElementDef>>) =>
      request<{ template: LabelTypeTemplate; isCustomized: boolean }>(`/jobs/${jobId}/label-templates/${labelType}`, {
        method: 'PUT',
        body: JSON.stringify({ elements }),
      }),
    reset: (jobId: string, labelType: string) =>
      request<{ template: LabelTypeTemplate; isCustomized: boolean }>(`/jobs/${jobId}/label-templates/${labelType}`, {
        method: 'DELETE',
      }),
  },
  printJobs: {
    list: (jobId?: string) => request<PrintJob[]>(`/print-jobs${jobId ? `?jobId=${jobId}` : ''}`),
    pdfUrl: (id: string) => `${BASE}/print-jobs/${id}/pdf`,
    retry: (id: string) => request<PrintJob>(`/print-jobs/${id}/retry`, { method: 'POST' }),
    cancel: (id: string) => request<PrintJob>(`/print-jobs/${id}/cancel`, { method: 'POST' }),
  },
  printerSettings: {
    get: () => request<PrinterSettings>('/printer-settings'),
    put: (settings: PrinterSettings) =>
      request<PrinterSettings>('/printer-settings', { method: 'PUT', body: JSON.stringify(settings) }),
    regenerateToken: () => request<PrinterSettings>('/printer-settings/regenerate-token', { method: 'POST' }),
    testConnection: (host?: string, port?: number) =>
      request<{ ok: boolean; message?: string }>('/printer-settings/test-connection', {
        method: 'POST',
        body: JSON.stringify({ host, port }),
      }),
  },
  activity: {
    list: (jobId?: string) => request<ActivityLogEntry[]>(`/activity${jobId ? `?jobId=${jobId}` : ''}`),
  },
  currentRms: {
    getConfig: () => request<CurrentRmsConfig>('/current-rms/config'),
    updateConfig: (data: Partial<{ enabled: boolean; subdomain: string; apiKey: string; pollMinutes: number; removeApiKey: boolean }>) =>
      request<CurrentRmsConfig>('/current-rms/config', { method: 'PUT', body: JSON.stringify(data) }),
    testConnection: (subdomain?: string, apiKey?: string) =>
      request<{ ok: boolean; message?: string }>('/current-rms/test-connection', {
        method: 'POST',
        body: JSON.stringify({ subdomain, apiKey }),
      }),
    sync: () => request<{ pulled: number; alertsRaised: number; error: string | null }>('/current-rms/sync', { method: 'POST' }),
    listOpportunities: (q?: string) =>
      request<CurrentRmsOpportunity[]>(`/current-rms/opportunities${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    importOpportunity: (
      rmsId: number,
      data?: {
        crewFeatures?: Partial<CrewFeatures>;
        oneDriveFolderPath?: string;
        name?: string;
        description?: string;
        address?: string;
        startsAt?: string;
        endsAt?: string;
      }
    ) => request<Job>(`/current-rms/opportunities/${rmsId}/import`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
    bulkImport: (rmsIds: number[], crewFeatures?: Partial<CrewFeatures>) =>
      request<{ created: Job[]; skipped: { rmsId: number; reason: string }[] }>('/current-rms/opportunities/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ rmsIds, crewFeatures }),
      }),
  },
  oneDrive: {
    getConfig: () => request<OneDriveConfig>('/onedrive/config'),
    updateConfig: (data: Partial<{ enabled: boolean; tenantId: string; clientId: string; clientSecret: string; driveId: string; rootFolderPath: string }>) =>
      request<OneDriveConfig>('/onedrive/config', { method: 'PUT', body: JSON.stringify(data) }),
    testConnection: () => request<{ ok: boolean; message?: string; error?: string }>('/onedrive/test-connection', { method: 'POST' }),
  },
  jobOneDrive: {
    get: (jobId: string) => request<JobOneDriveStatus>(`/jobs/${jobId}/onedrive`),
    match: (jobId: string) => request<{ matched: boolean; folderPath: string | null }>(`/jobs/${jobId}/onedrive/match`, { method: 'POST' }),
    setFolder: (jobId: string, path: string) =>
      request<{ folderId: string | null; folderPath: string | null; matchStatus: string | null }>(`/jobs/${jobId}/onedrive/folder`, {
        method: 'PUT',
        body: JSON.stringify({ path }),
      }),
    unlinkFolder: (jobId: string) => request<void>(`/jobs/${jobId}/onedrive/folder`, { method: 'DELETE' }),
    browse: (jobId: string, folderId?: string) =>
      request<{ items: OneDriveItem[] }>(`/jobs/${jobId}/onedrive/browse${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`),
    share: (jobId: string, item: { itemId: string; itemName: string; itemPath: string; isFolder: boolean }) =>
      request<OneDriveShare>(`/jobs/${jobId}/onedrive/share`, { method: 'POST', body: JSON.stringify(item) }),
    unshare: (jobId: string, shareId: string) => request<void>(`/jobs/${jobId}/onedrive/share/${shareId}`, { method: 'DELETE' }),
    setCadPlot: (jobId: string, shareId: string, isCadPlot: boolean) =>
      request<OneDriveShare>(`/jobs/${jobId}/onedrive/share/${shareId}`, { method: 'PATCH', body: JSON.stringify({ isCadPlot }) }),
    fileUrl: (jobId: string, itemId: string) => `${BASE}/jobs/${jobId}/onedrive/file/${itemId}`,
  },
  portalSettings: {
    getCrewFeaturesDefault: () => request<CrewFeatures>('/portal-settings/crew-features-default'),
    updateCrewFeaturesDefault: (patch: Partial<CrewFeatures>) =>
      request<CrewFeatures>('/portal-settings/crew-features-default', { method: 'PUT', body: JSON.stringify(patch) }),
  },
  jobCurrentRms: {
    get: (jobId: string) =>
      request<{ linked: boolean; opportunity?: CurrentRmsOpportunity; rmsAlertAt?: string | null }>(
        `/jobs/${jobId}/current-rms`
      ),
    pickList: (jobId: string) => request<{ items: CurrentRmsPickItem[] }>(`/jobs/${jobId}/current-rms/pick-list`),
    setPrepped: (jobId: string, itemId: number, prepped: boolean) =>
      request<{ prepped: boolean }>(`/jobs/${jobId}/current-rms/pick-list/${itemId}/prepped`, {
        method: 'PUT',
        body: JSON.stringify({ prepped }),
      }),
    itemsDiff: (jobId: string) =>
      request<{ diff: PickListDiff | null; diffAt: string | null }>(`/jobs/${jobId}/current-rms/items-diff`),
    acknowledgeItemsDiff: (jobId: string) =>
      request<{ diff: null }>(`/jobs/${jobId}/current-rms/items-diff/acknowledge`, { method: 'POST' }),
    link: (jobId: string, rmsId: number) =>
      request<Job>(`/jobs/${jobId}/current-rms/link`, { method: 'POST', body: JSON.stringify({ rmsId }) }),
    unlink: (jobId: string) => request<Job>(`/jobs/${jobId}/current-rms/unlink`, { method: 'POST' }),
    acknowledge: (jobId: string) => request<Job>(`/jobs/${jobId}/current-rms/acknowledge`, { method: 'POST' }),
  },
};
