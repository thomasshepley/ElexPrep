import { BASE, request } from '../http';
import type { ActivityLogEntry, AppNotification, AuthedUser, BugReport, LoginRequiresTotp, PermissionKey, Role } from '../types';

export const accountApi = {
  version: {
    get: () =>
      request<{ version: string; changelog: { version: string; date: string; notes: string[]; sections?: { title: string; notes: string[] }[] }[] }>('/version'),
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
    update: (id: string, data: Partial<{ displayName: string; role: Role; password: string; isProjectManager: boolean }>) =>
      request<AuthedUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
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
  notifications: {
    list: () => request<AppNotification[]>('/notifications'),
    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
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
  activity: {
    list: (opts: { jobId?: string; before?: string } = {}) => {
      const params = new URLSearchParams(Object.entries(opts).filter((e): e is [string, string] => Boolean(e[1])));
      const qs = params.toString();
      return request<{ entries: ActivityLogEntry[]; nextCursor: string | null }>(`/activity${qs ? `?${qs}` : ''}`);
    },
  },
  siteUpdate: {
    status: () => request<SiteUpdateStatus>('/site-update'),
    check: () => request<SiteUpdateStatus>('/site-update/check', { method: 'POST' }),
    update: (data: { maintenance: boolean; password: string; code?: string }) =>
      request<SiteUpdateStatus>('/site-update/update', { method: 'POST', body: JSON.stringify(data) }),
  },
  lockdown: {
    setDevelopment: (enabled: boolean) =>
      request<void>('/lockdown/development', { method: 'POST', body: JSON.stringify({ enabled }) }),
    setFull: (enabled: boolean) => request<void>('/lockdown/full', { method: 'POST', body: JSON.stringify({ enabled }) }),
  },
};

/** What the server's update agent last reported (see server/src/routes/siteUpdate.ts). */
export interface SiteUpdateStatus {
  installed: boolean;
  agentSeenAt: string | null;
  currentVersion: string;
  state: 'idle' | 'checking' | 'updating' | 'done' | 'failed';
  /** It said it was running, but long ago: the agent stopped mid-way. */
  stale: boolean;
  busy: boolean;
  stateAt: string | null;
  info: Partial<
    Record<
      'action' | 'result' | 'maintenance' | 'branch' | 'upstream' | 'behind' | 'ahead' | 'dirty' | 'currentVersion' | 'incomingVersion' | 'head' | 'fromVersion' | 'toVersion' | 'startedAt' | 'finishedAt' | 'by',
      string
    >
  >;
  pendingSince: string | null;
  log: string;
  incoming: { sha: string; subject: string }[];
  incomingChangelog: { version: string; date: string; notes: string[]; sections: { title: string; notes: string[] }[] }[];
  history: { at: string; maintenance: boolean; result: string; from: string; to: string; by: string | null }[];
}
