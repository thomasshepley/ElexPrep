import type { FixtureProfileLike } from './cablePlan';

/**
 * Starting fixture database for the cable calculator, from the makers' and dealers' published
 * figures (Cable Calculator Plan, section 3, and weights from the Rigging Loads Calculator Plan,
 * section 4). Entries marked unverified need checking against
 * the manual; all of them are editable in Settings > Cable rules.
 */
export const SEED_FIXTURE_PROFILES: (Omit<FixtureProfileLike, 'typeKey'> & { notes?: string; weightKg?: number })[] = [
  { displayName: 'Robe BMFL Spot', weightKg: 36, watts: 2000, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Robe BMFL Blade', watts: 2000, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Wattage and power connector unverified' },
  { displayName: 'Robe Esprite', weightKg: 27.8, watts: 950, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'ETHERCON', notes: '870 W, 950 W for the HP' },
  { displayName: 'Robe MegaPointe', weightKg: 22, watts: 670, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Robe Pointe', watts: 470, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Robe Spiider', weightKg: 13.3, watts: 660, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'ETHERCON', hasDataThru: true, notes: 'Power thru unverified' },
  { displayName: 'Robe Tetra2', weightKg: 18.1, watts: 600, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'ETHERCON', hasDataThru: true },
  { displayName: 'Claypaky Sharpy', weightKg: 19, watts: 350, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Claypaky Mythos 2', weightKg: 32, watts: 700, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Martin MAC Aura XB', weightKg: 6.5, watts: 400, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'DMX5', aliases: 'Aura XB, MAC Aura XB' },
  { displayName: 'Martin MAC Quantum Profile', weightKg: 23.2, watts: 750, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Martin MAC Viper Profile', weightKg: 37.2, watts: 1225, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Viper, MAC Viper' },
  { displayName: 'Chauvet Maverick Storm 1 Hybrid', watts: 647, amps: 2.8, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Chauvet Maverick Storm 1 Flex', watts: 738, amps: 3.3, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Mav Storm 1 Flex' },
  { displayName: 'Chauvet Rogue R2X Wash', weightKg: 10.3, watts: 344, amps: 1.49, powerConnector: 'POWERCON', hasPowerThru: true, maxPerLine: 8, dataConnector: 'DMX5' },
  { displayName: 'SGM P-6', weightKg: 14.5, watts: 630, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', inrushA: 70, notes: 'Connector from a dealer listing' },
  { displayName: 'SGM Q-7', weightKg: 8.1, watts: 465, powerConnector: 'CEE16', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Prolights AstraBlade 100 IP', weightKg: 27.4, watts: 750, powerConnector: 'OTHER', hasPowerThru: true, maxPerLine: 4, dataConnector: 'DMX5', notes: 'Power connector type unverified' },
  { displayName: 'ACME Pixel Line IP', weightKg: 7.3, watts: 420, powerConnector: 'OTHER', hasPowerThru: true, dataConnector: 'DMX5', notes: 'IP power in and out' },
  { displayName: 'GLP JDC1', weightKg: 12, watts: 1200, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'GLP impression X4 Bar 20', weightKg: 16, watts: 450, powerConnector: 'POWERCON', hasPowerThru: true, dataConnector: 'DMX5' },
  { displayName: 'Molefay 4-lite', watts: 2600, amps: 11, powerConnector: 'CEE16', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Dimmer or relay; the 8-lite needs two 16A' },
  { displayName: 'Martin Atomic 3000 LED', watts: 740, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', inrushA: 17.7, notes: 'Power connector unverified' },
  { displayName: 'Martin MAC Viper Performance', weightKg: 39, watts: 1200, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Viper Performance', notes: 'Unverified: confirm the wattage, connector and weight' },
  { displayName: 'Ayrton Diablo S', weightKg: 22, watts: 450, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Diablo S, Diablo-S', notes: 'Unverified: confirm the wattage and connector' },
  { displayName: 'Chauvet Strike Array 2', weightKg: 8, watts: 300, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'DMX5', aliases: 'Strike Array 2', notes: 'Unverified: confirm the wattage and connector' },
];
