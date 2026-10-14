import type { FixtureProfileLike } from './cablePlan';

/**
 * Starting fixture database for the cable calculator, from the makers' and dealers' published
 * figures (Cable Calculator Plan, section 3). Entries marked unverified need checking against
 * the manual; all of them are editable in Settings > Cable rules.
 */
export const SEED_FIXTURE_PROFILES: (Omit<FixtureProfileLike, 'typeKey'> & { notes?: string })[] = [
  { displayName: 'Robe BMFL Spot', watts: 2000, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Robe BMFL Blade', watts: 2000, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Wattage and power connector unverified' },
  { displayName: 'Robe Esprite', watts: 950, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'ETHERCON', notes: '870 W, 950 W for the HP' },
  { displayName: 'Robe MegaPointe', watts: 670, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Robe Pointe', watts: 470, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Robe Spiider', watts: 660, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'ETHERCON', hasDataThru: true, notes: 'Power thru unverified' },
  { displayName: 'Robe Tetra2', watts: 600, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'ETHERCON', hasDataThru: true },
  { displayName: 'Claypaky Sharpy', watts: 350, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Claypaky Mythos 2', watts: 700, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Martin MAC Aura XB', watts: 400, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'DMX5', aliases: 'Aura XB, MAC Aura XB' },
  { displayName: 'Martin MAC Quantum Profile', watts: 750, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Martin MAC Viper Profile', watts: 1225, powerConnector: 'POWERCON', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Viper, MAC Viper' },
  { displayName: 'Chauvet Maverick Storm 1 Hybrid', watts: 647, amps: 2.8, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'Chauvet Maverick Storm 1 Flex', watts: 738, amps: 3.3, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Mav Storm 1 Flex' },
  { displayName: 'Chauvet Rogue R2X Wash', watts: 344, amps: 1.49, powerConnector: 'POWERCON', hasPowerThru: true, maxPerLine: 8, dataConnector: 'DMX5' },
  { displayName: 'SGM P-6', watts: 630, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', inrushA: 70, notes: 'Connector from a dealer listing' },
  { displayName: 'SGM Q-7', watts: 465, powerConnector: 'CEE16', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Power connector unverified' },
  { displayName: 'Prolights AstraBlade 100 IP', watts: 750, powerConnector: 'OTHER', hasPowerThru: true, maxPerLine: 4, dataConnector: 'DMX5', notes: 'Power connector type unverified' },
  { displayName: 'ACME Pixel Line IP', watts: 420, powerConnector: 'OTHER', hasPowerThru: true, dataConnector: 'DMX5', notes: 'IP power in and out' },
  { displayName: 'GLP JDC1', watts: 1200, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5' },
  { displayName: 'GLP impression X4 Bar 20', watts: 450, powerConnector: 'POWERCON', hasPowerThru: true, dataConnector: 'DMX5' },
  { displayName: 'Molefay 4-lite', watts: 2600, amps: 11, powerConnector: 'CEE16', hasPowerThru: false, dataConnector: 'DMX5', notes: 'Dimmer or relay; the 8-lite needs two 16A' },
  { displayName: 'Martin Atomic 3000 LED', watts: 740, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', inrushA: 17.7, notes: 'Power connector unverified' },
  { displayName: 'Ayrton Diablo S', watts: 450, powerConnector: 'TRUE1', hasPowerThru: false, dataConnector: 'DMX5', aliases: 'Diablo S, Diablo-S', notes: 'Unverified: confirm the wattage and connector' },
  { displayName: 'Chauvet Strike Array 2', watts: 300, powerConnector: 'TRUE1', hasPowerThru: true, dataConnector: 'DMX5', aliases: 'Strike Array 2', notes: 'Unverified: confirm the wattage and connector' },
];
