import type { CablePlanResult, CableRules, DataConnector, PowerConnector, PositionKind } from '@elexprep/shared';
import { request } from '../http';

export type { CablePlanResult, CableRules };

export interface FixtureProfile {
  id: string;
  typeKey: string;
  displayName: string;
  watts: number;
  amps: number | null;
  powerConnector: PowerConnector;
  hasPowerThru: boolean;
  dataConnector: DataConnector;
  hasDataThru: boolean;
  maxPerLine: number | null;
  inrushA: number | null;
  aliases: string | null;
  notes: string | null;
  weightKg: number | null;
  clampKg: number | null;
}

export type FixtureProfileInput = Omit<FixtureProfile, 'id' | 'typeKey'>;

export interface JobPosition {
  id: string;
  name: string;
  kind: PositionKind;
  lengthM: number | null;
  trimM: number | null;
  distanceM: number | null;
  pickOffsetM: number | null;
  motors: number;
  source: 'PATCH' | 'PLOT' | 'EXPORT' | 'MANUAL';
  /** The plot truss it's linked to by hand: null matches automatically, '' means not on the plot. */
  plotTruss?: string | null;
  fixtureCount: number;
  inPatch: boolean;
}

export interface PlotGeometry {
  trusses: { position: string; lengthM: number; yM: number; pickOffsetM: number | null; points: string[] }[];
  lxPanelFound: boolean;
  notes: string[];
}

export interface JobCable {
  inputs: {
    fixtureCount: number;
    positionCount: number;
    unplaced: string[];
    unknownTypes: string[];
    /** Every CAD plot on the job: uploaded, or on OneDrive (the CAD folder's PDF or a file marked as a CAD plot). */
    plots: { source: 'UPLOAD' | 'ONEDRIVE'; ref: string; name: string; note?: string }[];
    kit: { linked: boolean; lines: { name: string; quantity: number }[]; error: string | null };
  };
  positions: JobPosition[];
  rules: CableRules;
  plan: { computedAt: string; stale: boolean; result: CablePlanResult; overrides: Record<string, number> } | null;
  plot: { sourceName: string; createdAt: string; geometry: PlotGeometry } | null;
}

const json = (b: unknown) => JSON.stringify(b);

export const cableApi = {
  cable: {
    rules: () => request<{ rules: CableRules; defaults: CableRules }>('/cable/rules'),
    saveRules: (patch: Partial<CableRules>) => request<{ rules: CableRules; defaults: CableRules }>('/cable/rules', { method: 'PUT', body: json(patch) }),
    profiles: () => request<FixtureProfile[]>('/cable/profiles'),
    createProfile: (data: FixtureProfileInput) => request<FixtureProfile>('/cable/profiles', { method: 'POST', body: json(data) }),
    updateProfile: (id: string, data: FixtureProfileInput) => request<FixtureProfile>(`/cable/profiles/${id}`, { method: 'PUT', body: json(data) }),
    deleteProfile: (id: string) => request<void>(`/cable/profiles/${id}`, { method: 'DELETE' }),
    job: (jobId: string) => request<JobCable>(`/jobs/${jobId}/cable`),
    compute: (jobId: string) => request<NonNullable<JobCable['plan']>>(`/jobs/${jobId}/cable/compute`, { method: 'POST' }),
    updatePosition: (jobId: string, id: string, data: Partial<Pick<JobPosition, 'kind' | 'lengthM' | 'trimM' | 'distanceM' | 'pickOffsetM' | 'motors' | 'plotTruss'>>) =>
      request<JobPosition>(`/jobs/${jobId}/cable/positions/${id}`, { method: 'PUT', body: json(data) }),
    setOverride: (jobId: string, key: string, quantity: number | null) =>
      request<{ overrides: Record<string, number> }>(`/jobs/${jobId}/cable/overrides`, { method: 'PUT', body: json({ key, quantity }) }),
    readPlot: (jobId: string, source: 'UPLOAD' | 'ONEDRIVE', ref: string) =>
      request<{ geometry: PlotGeometry; applied: string[] }>(`/jobs/${jobId}/cable/read-plot`, { method: 'POST', body: json({ source, ref }) }),
    csvUrl: (jobId: string) => `/api/jobs/${jobId}/cable/export.csv`,
  },
};
