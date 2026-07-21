/** Safety cap on copies per label so a typo (e.g. "50" instead of "5") can't be confirmed blind. */
export const MAX_COPIES_WITHOUT_OVERRIDE = 10;

/** Printer tray routing reference for the Develop ineo+ 3320i, per Elex's physical setup. */
export const PRINTER_TRAY_MAP: Record<string, string> = {
  PAL: 'Tray 1',
  FIXTURE: 'Tray 2',
  TRUSS_SPIKE_POSITION: 'Tray 2',
  TRUSS_SPIKE_TIP: 'Tray 2',
  TRUSS_SPIKE_SACN: 'Tray 2',
  CABLE: 'Bypass Tray',
  RACK: 'Bypass Tray',
};
