/**
 * Starting truss profiles and hoist models for the rigging calculator (Rigging Loads Calculator
 * Plan, section 4). Everything is editable in Settings > Rigging; entries noted as unverified
 * came from retailer or hire pages and must be checked against the maker's own figures.
 */
export const SEED_TRUSS_PROFILES: {
  name: string;
  maker: string;
  kgPerM: number;
  spanTable: { spanM: number; udlKgPerM: number }[];
  cantileverRatio: number;
  notes?: string;
}[] = [
  {
    name: 'Global Truss F34',
    maker: 'Global Truss',
    kgPerM: 6.25,
    spanTable: [
      { spanM: 6, udlKgPerM: 122 },
      { spanM: 8, udlKgPerM: 64 },
    ],
    cantileverRatio: 0.25,
    notes: 'Unverified: confirm the weight and load table (L/180) against the Global Truss F34 sheet',
  },
  {
    name: 'Prolyte H30V',
    maker: 'Prolyte',
    kgPerM: 6.3,
    spanTable: [
      { spanM: 6, udlKgPerM: 322 },
      { spanM: 8, udlKgPerM: 194 },
      { spanM: 10, udlKgPerM: 122 },
      { spanM: 12, udlKgPerM: 83 },
    ],
    cantileverRatio: 1 / 6,
  },
  {
    name: 'Prolyte H40V',
    maker: 'Prolyte',
    kgPerM: 6.9,
    spanTable: [
      { spanM: 6, udlKgPerM: 415 },
      { spanM: 8, udlKgPerM: 278 },
      { spanM: 10, udlKgPerM: 175 },
      { spanM: 12, udlKgPerM: 120 },
    ],
    cantileverRatio: 1 / 6,
  },
  {
    name: 'Prolyte S36R',
    maker: 'Prolyte',
    kgPerM: 10.5,
    spanTable: [
      { spanM: 6, udlKgPerM: 597 },
      { spanM: 8, udlKgPerM: 332 },
      { spanM: 10, udlKgPerM: 209 },
      { spanM: 12, udlKgPerM: 142 },
    ],
    cantileverRatio: 1 / 6,
  },
  {
    name: 'Litec QX30SA',
    maker: 'Litec',
    kgPerM: 5.5,
    spanTable: [
      { spanM: 6, udlKgPerM: 241 },
      { spanM: 8, udlKgPerM: 133 },
      { spanM: 10, udlKgPerM: 83 },
      { spanM: 12, udlKgPerM: 56 },
    ],
    cantileverRatio: 0.25,
    notes: 'Cantilever limit not from the maker: check the Litec table',
  },
  {
    name: 'Milos M290 Quatro',
    maker: 'Milos',
    kgPerM: 5,
    spanTable: [
      { spanM: 6, udlKgPerM: 220 },
      { spanM: 8, udlKgPerM: 141 },
      { spanM: 10, udlKgPerM: 89 },
      { spanM: 12, udlKgPerM: 60 },
    ],
    cantileverRatio: 0.25,
    notes: 'Cantilever limit not from the maker: check the Milos table',
  },
];

export const SEED_HOIST_MODELS: { name: string; ratedKg: number; hoistClass: string; bodyKg: number; chainKgPerM: number; chainM: number; notes?: string }[] = [
  { name: 'CM Lodestar 500 kg', ratedKg: 500, hoistClass: 'D8+', bodyKg: 35, chainKgPerM: 1.2, chainM: 20 },
  { name: 'CM Lodestar 1 t', ratedKg: 1000, hoistClass: 'D8+', bodyKg: 58, chainKgPerM: 1.65, chainM: 20 },
  { name: 'CM Lodestar 250 kg', ratedKg: 250, hoistClass: 'D8+', bodyKg: 25, chainKgPerM: 0.8, chainM: 20, notes: 'Unverified: confirm the body and chain weight' },
  { name: 'EXE Rise 500 kg', ratedKg: 500, hoistClass: 'D8+', bodyKg: 30, chainKgPerM: 1.1, chainM: 20, notes: 'Unverified: confirm the body and chain weight' },
  { name: 'EXE Rise 1 t', ratedKg: 1000, hoistClass: 'D8+', bodyKg: 48, chainKgPerM: 1.6, chainM: 20, notes: 'Unverified: confirm the body and chain weight' },
  { name: 'EXE Rise 250 kg', ratedKg: 250, hoistClass: 'D8+', bodyKg: 22, chainKgPerM: 0.8, chainM: 20, notes: 'Unverified: confirm the body and chain weight' },
];
