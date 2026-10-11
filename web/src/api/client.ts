import type { PickListDiff, LabelElementDef, LabelTypeTemplate } from '@elexprep/shared';
export type { LabelElementDef, LabelTypeTemplate, TextElementDef, StackedTextElementDef, FillElementDef, ImageElementDef } from '@elexprep/shared';

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
  logoPath: string | null;
  isPublic: boolean;
  currentRmsOpportunityId: string | null;
  rmsAlertAt: string | null;
  createdAt: string;
}

export interface FixtureTypeRule {
  id: string;
  name: string;
  unitsPerCase: number;
  caseLabelOverride: string | null;
}

export type LocationColorPattern = 'SOLID' | 'DIAGONAL_STRIPES';

export interface LocationColorRule {
  id: string;
  location: string;
  color: string;
  pattern: LocationColorPattern;
  secondaryColor: string | null;
}

export interface Fixture {
  id: string;
  address: number;
  fixtureType: string;
  mainUniverse: number | null;
  mainAddress: number | null;
  pixUniverse: number | null;
  pixAddress: number | null;
  mode: string | null;
  location: string | null;
}

export interface CaseGroup {
  id: string;
  fixtureType: string;
  label: string;
  location: string | null;
  addresses: number[];
}

export interface PrintQueueItem {
  id: string;
  labelType: string;
  sourceType: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'PRINTED';
  order: number;
  content: Record<string, unknown>;
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
  createdAt: string;
  userName?: string | null;
  jobName?: string | null;
}

export type Role = 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW';

export type PermissionKey =
  | 'createJobs'
  | 'deleteJobs'
  | 'publishJobs'
  | 'viewActivityLog'
  | 'linkCurrentRms'
  | 'manageCrewAssignments'
  | 'manageCrewApplications';

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: Record<string, unknown>;
  permissions?: Record<PermissionKey, boolean>;
}

export interface CrewMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  phone: string | null;
  skills: string | null;
  dayRate: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
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
  dayRate: string | null;
  rightToWork: string | null;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
}

export interface CrewApplicationDetail extends CrewApplicationSummary {
  documents: CrewDocumentSummary[];
}

export interface JobCrewAssignment {
  id: string;
  crewProfileId: string;
  displayName: string;
  username: string;
  role: string;
  dayRate: string | null;
  profileDayRate: string | null;
  active: boolean;
}

export interface CrewMe {
  id: string;
  displayName: string;
  phone: string | null;
  skills: string | null;
  dayRate: string | null;
}

export interface CrewMyJob {
  jobId: string;
  jobName: string;
  venue: string | null;
  role: string;
  startsAt: string | null;
  endsAt: string | null;
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
  memberName: string | null;
  value: number | null;
  startsAt: string | null;
  endsAt: string | null;
  rmsUpdatedAt: string | null;
  syncedAt: string;
}

export interface JobScheduleItem {
  id: string;
  jobId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  notes: string | null;
}

export interface JobDocument {
  id: string;
  jobId: string;
  originalName: string;
  mimeType: string;
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
}

export interface DiscussionMessage {
  id: string;
  jobId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
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
  [key: string]: unknown;
}

export const api = {
  auth: {
    status: () => request<{ needsSetup: boolean }>('/auth/status'),
    setup: (data: { username: string; password: string; displayName?: string }) =>
      request<AuthedUser>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { username: string; password: string }) =>
      request<AuthedUser>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<AuthedUser>('/auth/me'),
    updateMe: (data: {
      displayName?: string;
      password?: string;
      currentPassword?: string;
      prefs?: Record<string, unknown>;
    }) => request<AuthedUser>('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
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
    create: (data: {
      username: string;
      password: string;
      displayName?: string;
      phone?: string;
      skills?: string;
      dayRate?: string;
      notes?: string;
    }) => request<CrewMember>('/crew', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{
        displayName: string;
        password: string;
        phone: string;
        skills: string;
        dayRate: string;
        notes: string;
        active: boolean;
      }>
    ) => request<CrewMember>(`/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/crew/${id}`, { method: 'DELETE' }),
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
  },
  crewApplications: {
    submit: (form: FormData) => request<{ id: string }>('/crew-applications', { method: 'POST', body: form }),
    list: (status?: string) =>
      request<CrewApplicationSummary[]>(`/crew-applications${status ? `?status=${status}` : ''}`),
    get: (id: string) => request<CrewApplicationDetail>(`/crew-applications/${id}`),
    documentUrl: (appId: string, docId: string) => `${BASE}/crew-applications/${appId}/documents/${docId}`,
    approve: (id: string, data: { username: string; password: string; displayName?: string }) =>
      request<{ userId: string; crewProfileId: string; username: string }>(`/crew-applications/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reject: (id: string, note?: string) =>
      request<void>(`/crew-applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  crewPortal: {
    me: () => request<CrewMe>('/crew/me'),
    myJobs: () => request<CrewMyJob[]>('/crew/me/jobs'),
    jobDetail: (jobId: string) => request<CrewJobDetail>(`/crew/me/jobs/${jobId}`),
    schedule: (jobId: string) => request<JobScheduleItem[]>(`/crew/me/jobs/${jobId}/schedule`),
    kitList: (jobId: string) => request<{ items: KitListItem[] }>(`/crew/me/jobs/${jobId}/kit-list`),
    documents: (jobId: string) => request<JobDocument[]>(`/crew/me/jobs/${jobId}/documents`),
    documentUrl: (jobId: string, docId: string) => `${BASE}/crew/me/jobs/${jobId}/documents/${docId}/file`,
    plots: (jobId: string) => request<Plot[]>(`/crew/me/jobs/${jobId}/plots`),
    plotUrl: (jobId: string, plotId: string) => `${BASE}/crew/me/jobs/${jobId}/plots/${plotId}/file`,
    submitLabelRequest: (jobId: string, data: { labelType: string; content: Record<string, unknown>; quantity?: number }) =>
      request<CrewLabelRequest>(`/crew/me/jobs/${jobId}/label-requests`, { method: 'POST', body: JSON.stringify(data) }),
    discussion: {
      list: (jobId: string) => request<DiscussionMessage[]>(`/crew/me/jobs/${jobId}/discussion`),
      send: (jobId: string, body: string) =>
        request<DiscussionMessage>(`/crew/me/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body }) }),
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
    create: (jobId: string, data: { title: string; startsAt: string; endsAt?: string; notes?: string }) =>
      request<JobScheduleItem>(`/jobs/${jobId}/schedule`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ title: string; startsAt: string; endsAt: string | null; notes: string }>) =>
      request<JobScheduleItem>(`/jobs/${jobId}/schedule/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/schedule/${id}`, { method: 'DELETE' }),
  },
  jobDiscussion: {
    list: (jobId: string) => request<DiscussionMessage[]>(`/jobs/${jobId}/discussion`),
    send: (jobId: string, body: string) =>
      request<DiscussionMessage>(`/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body }) }),
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
    create: (jobId: string, data: { crewProfileId: string; role: string; dayRate?: string }) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ role: string; dayRate: string }>) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/crew/${id}`, { method: 'DELETE' }),
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
    create: (data: { name: string; venue?: string }) =>
      request<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<Job, 'name' | 'venue' | 'isPublic'>>) =>
      request<Job>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
    uploadLogo: async (id: string, file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return request<Job>(`/jobs/${id}/logo`, { method: 'POST', body: form });
    },
    logoUrl: (id: string) => `${BASE}/jobs/${id}/logo`,
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
    import: (jobId: string, rows: Record<string, string>[], mapping?: Record<string, string>) =>
      request<{ imported: number }>(`/jobs/${jobId}/patch/import`, {
        method: 'POST',
        body: JSON.stringify(mapping ? { mapping, rows } : { rows }),
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
  },
  cases: {
    generate: (jobId: string) => request<{ generated: number }>(`/jobs/${jobId}/cases/generate`, { method: 'POST' }),
    list: (jobId: string) => request<CaseGroup[]>(`/jobs/${jobId}/cases`),
    create: (jobId: string, data: { fixtureType: string; label: string; location?: string; addresses?: number[] }) =>
      request<CaseGroup>(`/jobs/${jobId}/cases`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ fixtureType: string; label: string; location: string }>) =>
      request<CaseGroup>(`/jobs/${jobId}/cases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/cases/${id}`, { method: 'DELETE' }),
    bulkSetLocation: (jobId: string, ids: string[], location: string) =>
      request<{ updated: number }>(`/jobs/${jobId}/cases/bulk`, { method: 'PUT', body: JSON.stringify({ ids, location }) }),
    bulkRemove: (jobId: string, ids: string[]) =>
      request<{ deleted: number }>(`/jobs/${jobId}/cases/bulk`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
  },
  adHocLabels: {
    list: (jobId: string) => request<AdHocLabel[]>(`/jobs/${jobId}/adhoc-labels`),
    create: (jobId: string, data: { labelType: string; content: Record<string, unknown>; quantity: number }) =>
      request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels`, { method: 'POST', body: JSON.stringify(data) }),
    update: (
      jobId: string,
      id: string,
      data: Partial<{ content: Record<string, unknown>; quantity: number; excludeFromPrint: boolean }>
    ) => request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/adhoc-labels/${id}`, { method: 'DELETE' }),
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
    updateConfig: (data: Partial<{ enabled: boolean; subdomain: string; apiKey: string; pollMinutes: number }>) =>
      request<CurrentRmsConfig>('/current-rms/config', { method: 'PUT', body: JSON.stringify(data) }),
    testConnection: (subdomain?: string, apiKey?: string) =>
      request<{ ok: boolean; message?: string }>('/current-rms/test-connection', {
        method: 'POST',
        body: JSON.stringify({ subdomain, apiKey }),
      }),
    sync: () => request<{ pulled: number; alertsRaised: number; error: string | null }>('/current-rms/sync', { method: 'POST' }),
    listOpportunities: (q?: string) =>
      request<CurrentRmsOpportunity[]>(`/current-rms/opportunities${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    importOpportunity: (rmsId: number) =>
      request<Job>(`/current-rms/opportunities/${rmsId}/import`, { method: 'POST' }),
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
