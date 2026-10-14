import type { Rig, RigMethod, PointKind, RigSettings } from '@elexprep/shared';
import { request } from '../http';

export type { Rig, RigMethod, PointKind };

export interface RiggingSettings extends RigSettings {
  defaultTrussProfileId: string | null;
  defaultHoistModelId: string | null;
  clampKg: number;
  socaKgPerM: number;
  dmxKgPerM: number;
  catKgPerM: number;
  connectorPct: number;
}

export interface TrussProfile {
  id: string;
  name: string;
  maker: string | null;
  kgPerM: number;
  spanTable: { spanM: number; udlKgPerM: number }[];
  cantileverRatio: number;
  source: string | null;
  notes: string | null;
}

export interface HoistModel {
  id: string;
  name: string;
  ratedKg: number;
  hoistClass: string;
  bodyKg: number;
  chainKgPerM: number;
  chainM: number;
  notes: string | null;
}

export interface RigOverrides {
  trusses?: Record<string, { profileId?: string | null; originX?: number; y?: number; lengthM?: number; hoists?: { pointId: string; x: number }[]; fixtureX?: Record<string, number> }>;
  points?: Record<string, { name?: string; x?: number; y?: number; kind?: PointKind; capacityKg?: number | null; hoistModelId?: string | null }>;
  addedPoints?: { id: string; name: string; x: number; y: number; kind: PointKind }[];
  removedPointIds?: string[];
}

export interface JobRigging {
  rig: Rig;
  trusses: { id: string; positionName: string; fromPlot: boolean; profileId: string | null; fixtures: { id: string; label: string; type: string; weightKg: number | null; x: number; placed: boolean }[]; cableKgPerM: number; dropKg: number }[];
  assumptions: string[];
  plotName: string | null;
  venue: string | null;
  venueSetApplied: boolean;
  overrides: RigOverrides;
  disclaimer: string;
  trussProfiles: { id: string; name: string }[];
  hoistModels: { id: string; name: string; ratedKg: number; hoistClass: string }[];
  record: { calculatedBy: string | null; calculatedAt: string | null; checkedByName: string | null; checkedAt: string | null };
}

const json = (b: unknown) => JSON.stringify(b);

export const riggingApi = {
  rigging: {
    config: () => request<{ settings: RiggingSettings; trussProfiles: TrussProfile[]; hoistModels: HoistModel[] }>('/rigging/config'),
    saveSettings: (patch: Partial<RiggingSettings>) => request<RiggingSettings>('/rigging/settings', { method: 'PUT', body: json(patch) }),
    createTruss: (data: Omit<TrussProfile, 'id'>) => request<TrussProfile>('/rigging/truss-profiles', { method: 'POST', body: json(data) }),
    updateTruss: (id: string, data: Omit<TrussProfile, 'id'>) => request<TrussProfile>(`/rigging/truss-profiles/${id}`, { method: 'PUT', body: json(data) }),
    deleteTruss: (id: string) => request<void>(`/rigging/truss-profiles/${id}`, { method: 'DELETE' }),
    createHoist: (data: Omit<HoistModel, 'id'>) => request<HoistModel>('/rigging/hoists', { method: 'POST', body: json(data) }),
    updateHoist: (id: string, data: Omit<HoistModel, 'id'>) => request<HoistModel>(`/rigging/hoists/${id}`, { method: 'PUT', body: json(data) }),
    deleteHoist: (id: string) => request<void>(`/rigging/hoists/${id}`, { method: 'DELETE' }),
    job: (jobId: string) => request<JobRigging>(`/jobs/${jobId}/rigging`),
    save: (jobId: string, data: { overrides?: RigOverrides; method?: RigMethod }) => request<JobRigging>(`/jobs/${jobId}/rigging`, { method: 'PUT', body: json(data) }),
    check: (jobId: string, checkedByName: string) => request<JobRigging>(`/jobs/${jobId}/rigging/check`, { method: 'POST', body: json({ checkedByName }) }),
    clearCheck: (jobId: string) => request<JobRigging>(`/jobs/${jobId}/rigging/check`, { method: 'DELETE' }),
    saveVenue: (jobId: string) => request<{ saved: number; venue: string }>(`/jobs/${jobId}/rigging/venue-capacities`, { method: 'POST' }),
    csvUrl: (jobId: string) => `/api/jobs/${jobId}/rigging/export.csv`,
  },
};
