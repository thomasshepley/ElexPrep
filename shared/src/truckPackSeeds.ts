import type { PackCategory } from './truckPack';

/**
 * Starting figures for the truck pack (alpha). Case sizes are typical road-case outside sizes
 * (castors and lid included), not measured from Elex's own stock: measure yours and correct them.
 * Vehicle sizes are typical inside load-space figures for UK hire and haulage vehicles; every body
 * builder differs, so check the vehicle's own plate and spec sheet.
 */

export interface SeedCase {
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  emptyKg: number;
  maxStack: number;
  canGoOnTop: boolean;
  canRotate: boolean;
  category: PackCategory;
  holds: number;
  notes?: string;
}

const EST = 'Typical size: measure your own case';
// Stack limits are the most a case takes on top of itself; the roof height usually decides first
// (three 900 mm cases only fit in a mega trailer).

export const SEED_TRUCK_CASES: SeedCase[] = [
  // Fixtures. Touring cases are built to a 600 mm module so two sit side by side across a truck.
  { name: '2-way moving head case', lengthMm: 1200, widthMm: 600, heightMm: 900, emptyKg: 40, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 2, notes: `${EST}. Spots and washes up to about 25 kg.` },
  { name: '2-way large moving head case', lengthMm: 1300, widthMm: 650, heightMm: 1050, emptyKg: 48, maxStack: 2, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 2, notes: `${EST}. BMFL, Viper and similar.` },
  { name: '4-way moving head case', lengthMm: 1200, widthMm: 600, heightMm: 750, emptyKg: 38, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 4, notes: `${EST}. Small heads such as Sharpy and Q-7.` },
  { name: '6-way wash case', lengthMm: 1200, widthMm: 600, heightMm: 700, emptyKg: 36, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 6, notes: `${EST}. Aura XB and similar small washes.` },
  { name: '4-way blinder case', lengthMm: 1200, widthMm: 600, heightMm: 600, emptyKg: 30, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 4, notes: EST },
  { name: '6-way batten case', lengthMm: 1240, widthMm: 600, heightMm: 600, emptyKg: 30, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 6, notes: `${EST}. 1 m battens.` },
  { name: '2-way strobe case', lengthMm: 1200, widthMm: 600, heightMm: 700, emptyKg: 32, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'FIXTURES', holds: 2, notes: EST },
  // Cable.
  { name: 'Cable trunk', lengthMm: 1240, widthMm: 640, heightMm: 780, emptyKg: 36, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'CABLE', holds: 1, notes: '1200 x 600 x 600 mm inside, on 100 mm castors. Typical size: measure your own.' },
  { name: 'Half cable trunk', lengthMm: 840, widthMm: 640, heightMm: 780, emptyKg: 26, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'CABLE', holds: 1, notes: EST },
  // Rigging.
  { name: 'Single motor case', lengthMm: 600, widthMm: 600, heightMm: 800, emptyKg: 22, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'RIGGING', holds: 1, notes: `${EST}. One 500 kg motor and its chain bag.` },
  { name: 'Motor controller rack', lengthMm: 600, widthMm: 600, heightMm: 700, emptyKg: 28, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'RIGGING', holds: 1, notes: EST },
  { name: 'Rigging steel trunk', lengthMm: 1240, widthMm: 640, heightMm: 780, emptyKg: 36, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'RIGGING', holds: 1, notes: 'Shackles, slings and steels. Typical size: measure your own.' },
  { name: 'F34 truss 3 m', lengthMm: 3000, widthMm: 290, heightMm: 290, emptyKg: 18.8, maxStack: 9, canGoOnTop: false, canRotate: false, category: 'RIGGING', holds: 1, notes: 'Loose section, 6.25 kg per m. Usually on a truss dolly in practice.' },
  { name: 'F34 truss 2 m', lengthMm: 2000, widthMm: 290, heightMm: 290, emptyKg: 12.5, maxStack: 9, canGoOnTop: false, canRotate: false, category: 'RIGGING', holds: 1, notes: 'Loose section, 6.25 kg per m.' },
  { name: 'F34 truss 1 m', lengthMm: 1000, widthMm: 290, heightMm: 290, emptyKg: 6.3, maxStack: 9, canGoOnTop: true, canRotate: true, category: 'RIGGING', holds: 1, notes: 'Loose section, 6.25 kg per m.' },
  // Power and control.
  { name: 'Distro rack', lengthMm: 800, widthMm: 600, heightMm: 900, emptyKg: 75, maxStack: 1, canGoOnTop: false, canRotate: true, category: 'POWER', holds: 1, notes: `${EST}. Weight includes the distro.` },
  { name: 'Console case', lengthMm: 1500, widthMm: 900, heightMm: 500, emptyKg: 45, maxStack: 1, canGoOnTop: false, canRotate: true, category: 'CONTROL', holds: 1, notes: `${EST}. Nothing goes on top of a desk.` },
  { name: 'Network and data rack', lengthMm: 700, widthMm: 600, heightMm: 700, emptyKg: 30, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'CONTROL', holds: 1, notes: EST },
  { name: 'Hazer case', lengthMm: 700, widthMm: 500, heightMm: 600, emptyKg: 15, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'OTHER', holds: 1, notes: EST },
  { name: 'Small accessory case', lengthMm: 800, widthMm: 600, heightMm: 500, emptyKg: 15, maxStack: 3, canGoOnTop: true, canRotate: true, category: 'OTHER', holds: 1, notes: EST },
];

/** Which case each fixture in the fixture database travels in. */
export const SEED_FIXTURE_CASES: Record<string, string> = {
  'Robe BMFL Spot': '2-way large moving head case',
  'Robe BMFL Blade': '2-way large moving head case',
  'Robe Esprite': '2-way moving head case',
  'Robe MegaPointe': '2-way moving head case',
  'Robe Pointe': '2-way moving head case',
  'Robe Spiider': '2-way moving head case',
  'Robe Tetra2': '6-way batten case',
  'Claypaky Sharpy': '4-way moving head case',
  'Claypaky Mythos 2': '2-way large moving head case',
  'Martin MAC Aura XB': '6-way wash case',
  'Martin MAC Quantum Profile': '2-way moving head case',
  'Martin MAC Viper Profile': '2-way large moving head case',
  'Martin MAC Viper Performance': '2-way large moving head case',
  'Chauvet Maverick Storm 1 Hybrid': '2-way large moving head case',
  'Chauvet Maverick Storm 1 Flex': '2-way large moving head case',
  'Chauvet Rogue R2X Wash': '4-way moving head case',
  'Chauvet Strike Array 2': '4-way blinder case',
  'SGM P-6': '4-way blinder case',
  'SGM Q-7': '4-way blinder case',
  'Prolights AstraBlade 100 IP': '6-way batten case',
  'ACME Pixel Line IP': '6-way batten case',
  'GLP JDC1': '2-way strobe case',
  'GLP impression X4 Bar 20': '6-way batten case',
  'Molefay 4-lite': '4-way blinder case',
  'Martin Atomic 3000 LED': '2-way strobe case',
  'Ayrton Diablo S': '2-way moving head case',
};

export interface SeedItemRule {
  match: string;
  caseName: string | null;
  unitsPerCase: number;
  itemKg: number;
  ignore?: boolean;
  category?: PackCategory;
}

/** Common kit-list lines that aren't fixtures or cable. Words must all appear in the line's name. */
export const SEED_ITEM_RULES: SeedItemRule[] = [
  { match: 'lodestar', caseName: 'Single motor case', unitsPerCase: 1, itemKg: 59 },
  { match: 'motor 500kg', caseName: 'Single motor case', unitsPerCase: 1, itemKg: 59 },
  { match: 'motor 1t', caseName: 'Single motor case', unitsPerCase: 1, itemKg: 85 },
  { match: 'motor controller', caseName: 'Motor controller rack', unitsPerCase: 1, itemKg: 18 },
  { match: 'f34 3m', caseName: 'F34 truss 3 m', unitsPerCase: 1, itemKg: 0 },
  { match: 'f34 2m', caseName: 'F34 truss 2 m', unitsPerCase: 1, itemKg: 0 },
  { match: 'f34 1m', caseName: 'F34 truss 1 m', unitsPerCase: 1, itemKg: 0 },
  { match: 'shackle', caseName: 'Rigging steel trunk', unitsPerCase: 60, itemKg: 0.6 },
  { match: 'sling', caseName: 'Rigging steel trunk', unitsPerCase: 40, itemKg: 1 },
  { match: 'distro', caseName: 'Distro rack', unitsPerCase: 1, itemKg: 0 },
  { match: 'grandma', caseName: 'Console case', unitsPerCase: 1, itemKg: 30 },
  { match: 'chamsys', caseName: 'Console case', unitsPerCase: 1, itemKg: 25 },
  { match: 'avolites', caseName: 'Console case', unitsPerCase: 1, itemKg: 30 },
  { match: 'dmx node', caseName: 'Network and data rack', unitsPerCase: 4, itemKg: 2 },
  { match: 'network switch', caseName: 'Network and data rack', unitsPerCase: 4, itemKg: 3 },
  { match: 'hazer', caseName: 'Hazer case', unitsPerCase: 1, itemKg: 15 },
  { match: 'haze fluid', caseName: 'Small accessory case', unitsPerCase: 4, itemKg: 5 },
  { match: 'terminator', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
  { match: 'labour', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
  { match: 'technician', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
  { match: 'delivery', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
  { match: 'transport', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
  { match: 'gaffer tape', caseName: null, unitsPerCase: 1, itemKg: 0, ignore: true },
];

export interface SeedVehicle {
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  payloadKg: number;
  doorWidthMm?: number;
  doorHeightMm?: number;
  arch?: { fromMm: number; toMm: number; clearWidthMm: number };
  licence: string;
  notes: string;
}

export const SEED_VEHICLES: SeedVehicle[] = [
  {
    name: 'Medium van (Transit Custom L2)',
    lengthMm: 2900,
    widthMm: 1775,
    heightMm: 1400,
    payloadKg: 1000,
    doorWidthMm: 1400,
    doorHeightMm: 1300,
    arch: { fromMm: 1500, toMm: 2400, clearWidthMm: 1390 },
    licence: 'Car (B)',
    notes: 'Typical load space; payload varies with the engine and trim.',
  },
  {
    name: 'Long van (Sprinter L3 high roof)',
    lengthMm: 4300,
    widthMm: 1780,
    heightMm: 1950,
    payloadKg: 1200,
    doorWidthMm: 1560,
    doorHeightMm: 1820,
    arch: { fromMm: 2300, toMm: 3300, clearWidthMm: 1350 },
    licence: 'Car (B)',
    notes: 'About 1,350 mm between the wheel arches. Payload varies by model, 1,000 to 1,400 kg at 3.5 t.',
  },
  {
    name: 'Luton van 3.5 t with tail lift',
    lengthMm: 4000,
    widthMm: 2000,
    heightMm: 2150,
    payloadKg: 1000,
    doorWidthMm: 1950,
    doorHeightMm: 2050,
    licence: 'Car (B)',
    notes: 'Full width, no arches. Tail lifts are usually rated 500 kg. Payload is often under 1,000 kg once the lift is fitted.',
  },
  {
    name: '7.5 t box truck',
    lengthMm: 6100,
    widthMm: 2350,
    heightMm: 2400,
    payloadKg: 2500,
    doorWidthMm: 2250,
    doorHeightMm: 2250,
    licence: 'C1 (or pre-1997 car licence)',
    notes: 'Payload falls to about 2,000 kg with a heavy tail lift.',
  },
  {
    name: '12 t box truck',
    lengthMm: 7300,
    widthMm: 2450,
    heightMm: 2500,
    payloadKg: 5000,
    doorWidthMm: 2400,
    doorHeightMm: 2350,
    licence: 'C (HGV)',
    notes: 'Typical body; payload 5 to 6.5 t depending on the body.',
  },
  {
    name: '18 t box truck',
    lengthMm: 7900,
    widthMm: 2450,
    heightMm: 2600,
    payloadKg: 8000,
    doorWidthMm: 2400,
    doorHeightMm: 2450,
    licence: 'C (HGV)',
    notes: 'Typical rigid body; check the plated payload.',
  },
  {
    name: '13.6 m box trailer (artic)',
    lengthMm: 13620,
    widthMm: 2460,
    heightMm: 2700,
    payloadKg: 24000,
    doorWidthMm: 2440,
    doorHeightMm: 2600,
    licence: 'C+E (artic)',
    notes: 'Standard trailer. Payload is limited by the 44 t gross weight on six axles; often well under the plate in practice.',
  },
  {
    name: '13.6 m mega trailer (artic)',
    lengthMm: 13620,
    widthMm: 2460,
    heightMm: 2950,
    payloadKg: 24000,
    doorWidthMm: 2440,
    doorHeightMm: 2850,
    licence: 'C+E (artic)',
    notes: 'The taller trailer touring hauliers favour: room to triple-stack cable trunks.',
  },
];
