import { BASE, request } from '../http';
import type { DiscussionGroupInput, DayRateSource, RoleRate, DashboardData, DiscussionMessage, DiscussionThreadData, Job, JobContact, JobCrewAssignment, JobDay, JobDocument, JobScheduleItem, Plot } from '../types';
import type { CrewFeatures } from '@elexprep/shared';

export const jobsApi = {
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
    setCrewDayRate: (jobId: string, dayId: string, id: string, dayRate: string) =>
      request<{ id: string; dayRate: string | null }>(`/jobs/${jobId}/days/${dayId}/crew/${id}`, { method: 'PUT', body: JSON.stringify({ dayRate }) }),
  },
  jobDiscussion: {
    list: (jobId: string, groupId?: string | null) =>
      request<DiscussionThreadData>(`/jobs/${jobId}/discussion${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`),
    send: (jobId: string, body: string, groupId?: string | null) =>
      request<DiscussionMessage>(`/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body, groupId }) }),
    createGroup: (jobId: string, data: DiscussionGroupInput) =>
      request<{ id: string }>(`/jobs/${jobId}/discussion/groups`, { method: 'POST', body: JSON.stringify(data) }),
    updateGroup: (jobId: string, groupId: string, data: DiscussionGroupInput) =>
      request<{ id: string }>(`/jobs/${jobId}/discussion/groups/${groupId}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeGroup: (jobId: string, groupId: string) => request<void>(`/jobs/${jobId}/discussion/groups/${groupId}`, { method: 'DELETE' }),
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
    get: () => request<DashboardData>('/dashboard'),
  },
  jobCrewAssignments: {
    list: (jobId: string) => request<JobCrewAssignment[]>(`/jobs/${jobId}/crew`),
    create: (jobId: string, data: { crewProfileId: string; role: string; dayRate?: string; days?: string; zeroRated?: boolean }) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew`, { method: 'POST', body: JSON.stringify(data) }),
    update: (jobId: string, id: string, data: Partial<{ role: string; dayRate: string; days: string; zeroRated: boolean }>) =>
      request<JobCrewAssignment>(`/jobs/${jobId}/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (jobId: string, id: string) => request<void>(`/jobs/${jobId}/crew/${id}`, { method: 'DELETE' }),
    clearOverrides: (jobId: string) => request<{ cleared: number }>(`/jobs/${jobId}/crew/clear-overrides`, { method: 'POST' }),
  },
  jobRoleRates: {
    list: (jobId: string) => request<RoleRate[]>(`/jobs/${jobId}/role-rates`),
    /** A blank dayRate removes that role's rate for the job. */
    set: (jobId: string, role: string, dayRate: string) =>
      request<RoleRate | null>(`/jobs/${jobId}/role-rates`, { method: 'PUT', body: JSON.stringify({ role, dayRate }) }),
  },
  globalRoleRates: {
    list: () => request<RoleRate[]>('/role-rates'),
    set: (role: string, dayRate: string) => request<RoleRate | null>('/role-rates', { method: 'PUT', body: JSON.stringify({ role, dayRate }) }),
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
          dayRateSource: DayRateSource;
          suggestedRate: number;
          zeroRated: boolean;
          days: number;
          /** True when `days` is the count of job days assigned on the Schedule tab. */
          daysFromSchedule: boolean;
          /** How many of those days carry their own rate. */
          dayOverrides: number;
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
        logoScales?: Partial<Record<'left' | 'middle' | 'right', number>>;
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
};
