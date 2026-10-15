import { BASE, request } from '../http';
import type { CurrentRmsConfig, CurrentRmsOpportunity, CurrentRmsPickItem, Job, JobOneDriveStatus, OneDriveConfig, OneDriveItem, OneDriveShare } from '../types';
import type { CrewFeatures, PickListDiff } from '@elexprep/shared';

export const integrationsApi = {
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
