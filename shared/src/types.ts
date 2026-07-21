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
  'mainUniverseAddress',
  'pixUniverse',
  'pixAddress',
  'pixUniverseAddress',
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
  mainUniverseAddress: 'Main Universe.Address (combined, e.g. "3.109")',
  pixUniverse: 'Pixel-map Universe',
  pixAddress: 'Pixel-map DMX Address',
  pixUniverseAddress: 'Pixel-map Universe.Address (combined)',
  mode: 'Mode / Personality',
  location: 'Stage Location',
  ipAddress: 'sACN IP Address',
  subnetMask: 'Subnet Mask',
  notes: 'Notes',
};

/**
 * Common column-name synonyms seen in real patch exports (e.g. CAST Wysiwyg's patch report:
 * "Spot" for address, "Patch" for a combined universe.address, "Position" for stage location),
 * used to auto-guess a column mapping from a sample file's headers.
 */
export const PATCH_FIELD_SYNONYMS: Record<PatchFieldKey, string[]> = {
  address: ['address', 'spot', 'unit', 'unitnumber', 'fixturenumber', 'id'],
  fixtureType: ['fixturetype', 'type', 'fixture'],
  mainUniverse: ['mainuniverse', 'universe'],
  mainAddress: ['mainaddress', 'maindmxaddress', 'dmxaddress'],
  mainUniverseAddress: ['patch', 'universeaddress', 'mainpatch'],
  pixUniverse: ['pixuniverse', 'pixelmapuniverse'],
  pixAddress: ['pixaddress', 'pixelmapaddress'],
  pixUniverseAddress: ['pixpatch', 'pixelpatch'],
  mode: ['mode', 'personality', 'fixtureoptions', 'channels'],
  location: ['location', 'stagelocation', 'position'],
  ipAddress: ['ipaddress', 'sacnip'],
  subnetMask: ['subnetmask', 'subnet'],
  notes: ['notes', 'data'],
};
