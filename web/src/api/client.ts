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
  content: Record<string, unknown>;
}

export interface AdHocLabel {
  id: string;
  labelType: string;
  quantity: number;
  content: Record<string, unknown>;
}

export interface ActivityLogEntry {
  id: string;
  jobId: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
  userName?: string | null;
}

export type Role = 'ADMIN' | 'USER' | 'SIGNAGE';

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: Record<string, unknown>;
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
  startsAt: string | null;
  endsAt: string | null;
  rmsUpdatedAt: string | null;
  syncedAt: string;
}

export interface CurrentRmsPickItem {
  id: number;
  name?: string;
  product_name?: string;
  description?: string;
  quantity?: number;
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
  },
  cases: {
    generate: (jobId: string) => request<{ generated: number }>(`/jobs/${jobId}/cases/generate`, { method: 'POST' }),
    list: (jobId: string) => request<CaseGroup[]>(`/jobs/${jobId}/cases`),
  },
  adHocLabels: {
    list: (jobId: string) => request<AdHocLabel[]>(`/jobs/${jobId}/adhoc-labels`),
    create: (jobId: string, data: { labelType: string; content: Record<string, unknown>; quantity: number }) =>
      request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ content: Record<string, unknown>; quantity: number }>) =>
      request<AdHocLabel>(`/jobs/${jobId}/adhoc-labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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
    updateItem: (jobId: string, id: string, data: Partial<{ quantity: number }>) =>
      request<PrintQueueItem>(`/jobs/${jobId}/print-queue/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeItem: (jobId: string, id: string) =>
      request<void>(`/jobs/${jobId}/print-queue/${id}`, { method: 'DELETE' }),
    confirm: (jobId: string, ids: string[], override = false) =>
      request<{ confirmed: number }>(`/jobs/${jobId}/print-queue/confirm`, {
        method: 'POST',
        body: JSON.stringify({ ids, override }),
      }),
    pdfUrl: (jobId: string) => `${BASE}/jobs/${jobId}/print-queue/pdf`,
    send: (jobId: string) =>
      request<{ printJobs: PrintJob[] }>(`/jobs/${jobId}/print-queue/send`, { method: 'POST' }),
    printerConfig: (jobId: string) =>
      request<{ printer: string; trayMap: Record<string, string>; method: PrintMethod }>(
        `/jobs/${jobId}/printer-config`
      ),
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
    link: (jobId: string, rmsId: number) =>
      request<Job>(`/jobs/${jobId}/current-rms/link`, { method: 'POST', body: JSON.stringify({ rmsId }) }),
    unlink: (jobId: string) => request<Job>(`/jobs/${jobId}/current-rms/unlink`, { method: 'POST' }),
    acknowledge: (jobId: string) => request<Job>(`/jobs/${jobId}/current-rms/acknowledge`, { method: 'POST' }),
  },
};
