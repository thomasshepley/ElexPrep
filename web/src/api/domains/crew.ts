import { BASE, request } from '../http';
import type { AdHocLabel, BankDetails, CrewApplicationDetail, CrewApplicationSummary, CrewDocumentSummary, CrewJobDetail, CrewLabelRequest, CrewMe, CrewMember, CrewMyJob, CrewRateLine, DiscussionMessage, DiscussionThreadData, JobContact, JobDay, JobDocument, JobScheduleItem, KitListItem, OnboardingInvite, OneDriveShare, Plot } from '../types';
import type { CrewFeatures } from '@elexprep/shared';

export const crewApi = {
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
    calendarUrl: (jobId: string) => `${BASE}/crew/me/jobs/${jobId}/calendar.ics`,
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
      list: (jobId: string, groupId?: string | null) =>
        request<DiscussionThreadData>(`/crew/me/jobs/${jobId}/discussion${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`),
      send: (jobId: string, body: string, groupId?: string | null) =>
        request<DiscussionMessage>(`/crew/me/jobs/${jobId}/discussion`, { method: 'POST', body: JSON.stringify({ body, groupId }) }),
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
  portalSettings: {
    getCrewFeaturesDefault: () => request<CrewFeatures>('/portal-settings/crew-features-default'),
    updateCrewFeaturesDefault: (patch: Partial<CrewFeatures>) =>
      request<CrewFeatures>('/portal-settings/crew-features-default', { method: 'PUT', body: JSON.stringify(patch) }),
  },
};
