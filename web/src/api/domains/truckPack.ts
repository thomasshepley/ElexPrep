import type { CableKind, CableSpec, CaseSpecLike, ManifestResult, PackCategory, PackSettingsLike, VehicleLike } from '@elexprep/shared';
import { request } from '../http';

export type { PackCategory };

export interface TruckPackSettings extends PackSettingsLike {
  trunkCaseId: string | null;
  trunkLitres: number;
  trunkMaxKg: number;
  trunkFill: number;
  defaultCableLengthM: number;
  cableSpecs: Record<CableKind, CableSpec>;
}

export interface TruckCase extends CaseSpecLike {
  notes: string | null;
}

export interface TruckVehicle {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  payloadKg: number;
  doorWidthMm: number | null;
  doorHeightMm: number | null;
  archFromMm: number | null;
  archToMm: number | null;
  archClearWidthMm: number | null;
  licence: string | null;
  notes: string | null;
  enabled: boolean;
}

export interface TruckItemRule {
  id: string;
  match: string;
  caseId: string | null;
  unitsPerCase: number;
  itemKg: number;
  ignore: boolean;
  category: PackCategory | null;
}

export interface ManualCase {
  key: string;
  caseId: string;
  label: string;
  cases: number;
  kgEach: number | null;
}

export interface JobTruckPack {
  source: 'PICKLIST' | 'PATCH';
  requestedSource: 'AUTO' | 'PICKLIST' | 'PATCH';
  sourceNote: string | null;
  linked: boolean;
  kitLines: number;
  manifest: ManifestResult;
  cases: CaseSpecLike[];
  vehicles: (VehicleLike & { licence: string | null; notes: string | null })[];
  settings: TruckPackSettings;
  vehicleId: string | null;
  overrides: Record<string, number>;
  manual: ManualCase[];
  updatedAt: string | null;
  updatedBy: string | null;
}

const json = (b: unknown) => JSON.stringify(b);

export const truckPackApi = {
  truckPack: {
    config: () =>
      request<{ settings: TruckPackSettings; cases: TruckCase[]; vehicles: TruckVehicle[]; itemRules: TruckItemRule[]; fixtures: { id: string; displayName: string; weightKg: number | null; truckCaseId: string | null }[] }>('/truck-pack/config'),
    saveSettings: (patch: Partial<TruckPackSettings>) => request<TruckPackSettings>('/truck-pack/settings', { method: 'PUT', body: json(patch) }),
    createCase: (data: Omit<TruckCase, 'id'>) => request<TruckCase>('/truck-pack/cases', { method: 'POST', body: json(data) }),
    updateCase: (id: string, data: Omit<TruckCase, 'id'>) => request<TruckCase>(`/truck-pack/cases/${id}`, { method: 'PUT', body: json(data) }),
    deleteCase: (id: string) => request<void>(`/truck-pack/cases/${id}`, { method: 'DELETE' }),
    createVehicle: (data: Omit<TruckVehicle, 'id'>) => request<TruckVehicle>('/truck-pack/vehicles', { method: 'POST', body: json(data) }),
    updateVehicle: (id: string, data: Omit<TruckVehicle, 'id'>) => request<TruckVehicle>(`/truck-pack/vehicles/${id}`, { method: 'PUT', body: json(data) }),
    deleteVehicle: (id: string) => request<void>(`/truck-pack/vehicles/${id}`, { method: 'DELETE' }),
    saveRule: (data: Omit<TruckItemRule, 'id'>) => request<TruckItemRule>('/truck-pack/item-rules', { method: 'POST', body: json(data) }),
    updateRule: (id: string, data: Omit<TruckItemRule, 'id'>) => request<TruckItemRule>(`/truck-pack/item-rules/${id}`, { method: 'PUT', body: json(data) }),
    deleteRule: (id: string) => request<void>(`/truck-pack/item-rules/${id}`, { method: 'DELETE' }),
    setFixtureCase: (id: string, truckCaseId: string | null) => request<{ id: string; truckCaseId: string | null }>(`/truck-pack/fixtures/${id}`, { method: 'PUT', body: json({ truckCaseId }) }),
    job: (jobId: string) => request<JobTruckPack>(`/jobs/${jobId}/truck-pack`),
    save: (jobId: string, data: { source?: JobTruckPack['requestedSource']; vehicleId?: string | null; overrides?: Record<string, number>; manual?: ManualCase[] }) =>
      request<JobTruckPack>(`/jobs/${jobId}/truck-pack`, { method: 'PUT', body: json(data) }),
    csvUrl: (jobId: string, vehicleId?: string | null) => `/api/jobs/${jobId}/truck-pack/export.csv${vehicleId ? `?vehicle=${encodeURIComponent(vehicleId)}` : ''}`,
  },
};
