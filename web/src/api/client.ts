// The API client: request plumbing lives in http.ts, response types in types.ts, and each
// endpoint group in domains/*. Everything is re-exported from here so callers keep importing
// from 'api/client'.
export type { LabelElementDef, LabelTypeTemplate, TextElementDef, StackedTextElementDef, FillElementDef, ImageElementDef } from '@elexprep/shared';
export type { CrewFeatures, CrewFeatureKey } from '@elexprep/shared';
export { CREW_FEATURE_KEYS, CREW_FEATURE_LABELS, DEFAULT_CREW_FEATURES } from '@elexprep/shared';

export * from './types';
export { ApiError, setUnauthorizedHandler } from './http';
import { accountApi } from './domains/account';
import { crewApi } from './domains/crew';
import { jobsApi } from './domains/jobs';
import { prepApi } from './domains/prep';
import { integrationsApi } from './domains/integrations';
import { baysApi } from './domains/bays';
import { cableApi } from './domains/cable';
import { riggingApi } from './domains/rigging';
import { truckPackApi } from './domains/truckPack';
export * from './domains/rigging';
export * from './domains/truckPack';
export * from './domains/cable';
export * from './domains/bays';

export const api = {
  ...accountApi,
  ...crewApi,
  ...jobsApi,
  ...prepApi,
  ...integrationsApi,
  ...baysApi,
  ...cableApi,
  ...riggingApi,
  ...truckPackApi,
};
