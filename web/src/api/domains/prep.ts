import { BASE, request } from '../http';
import type { AdHocLabel, CaseGroup, Fixture, FixtureGroup, FixtureTypeRule, LocationColorPattern, LocationColorRule, PatchImportCandidate, PatchImportResult, PrintJob, PrintMethod, PrintQueueItem, PrinterSettings, RmsHeadingGroup, PatchSourceFile } from '../types';
import type { LabelElementDef, LabelTypeTemplate } from '@elexprep/shared';

export const prepApi = {
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
    listOneDriveFiles: (jobId: string) =>
      request<{ files: PatchSourceFile[]; foldersSearched: number; truncated: boolean }>(`/jobs/${jobId}/patch/onedrive-files`),
    readOneDriveFile: (jobId: string, key: string) =>
      request<{ candidate: PatchImportCandidate }>(`/jobs/${jobId}/patch/onedrive-files/read`, { method: 'POST', body: JSON.stringify({ key }) }),
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
    removeMany: (jobId: string, ids: { queueIds?: string[]; adHocIds?: string[] }) =>
      request<{ removed: number }>(`/jobs/${jobId}/print-queue/remove`, { method: 'POST', body: JSON.stringify(ids) }),
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
};
