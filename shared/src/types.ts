export type LabelType =
  | 'FIXTURE'
  | 'TRUSS_SPIKE_POSITION'
  | 'TRUSS_SPIKE_TIP'
  | 'TRUSS_SPIKE_SACN'
  | 'CABLE'
  | 'PAL'
  | 'RACK';

export type PrintQueueStatus = 'PENDING' | 'CONFIRMED' | 'PRINTED';

export interface FixtureTypeRule {
  id: string;
  name: string;
  unitsPerCase: number;
  caseLabelOverride?: string | null;
}

export interface RawFixtureInput {
  address: number;
  fixtureType: string;
  mainUniverse?: number | null;
  mainAddress?: number | null;
  pixUniverse?: number | null;
  pixAddress?: number | null;
  mode?: string | null;
  location?: string | null;
  ipAddress?: string | null;
  subnetMask?: string | null;
  notes?: string | null;
  raw?: Record<string, string>;
}

export interface CaseGroup {
  fixtureType: string;
  addresses: number[];
  label: string;
  location?: string | null;
}

/** Canonical CSV column keys a Wysiwyg-style patch export can be mapped onto. */
export const PATCH_FIELD_KEYS = [
  'address',
  'fixtureType',
  'mainUniverse',
  'mainAddress',
  'pixUniverse',
  'pixAddress',
  'mode',
  'location',
  'ipAddress',
  'subnetMask',
  'notes',
] as const;

export type PatchFieldKey = (typeof PATCH_FIELD_KEYS)[number];

export const PATCH_FIELD_LABELS: Record<PatchFieldKey, string> = {
  address: 'Address / Unit Number',
  fixtureType: 'Fixture Type',
  mainUniverse: 'Main Universe',
  mainAddress: 'Main DMX Address',
  pixUniverse: 'Pixel-map Universe',
  pixAddress: 'Pixel-map DMX Address',
  mode: 'Mode / Personality',
  location: 'Stage Location',
  ipAddress: 'sACN IP Address',
  subnetMask: 'Subnet Mask',
  notes: 'Notes',
};
