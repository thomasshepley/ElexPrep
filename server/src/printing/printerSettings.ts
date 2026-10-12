import crypto from 'crypto';
import { prisma } from '../db';

export type PrintMethod = 'DRY_RUN' | 'DIRECT_9100' | 'AGENT';
export type TrayKey = 'TRAY1' | 'TRAY2' | 'BYPASS';

export interface TrayConfig {
  /** Human-readable name shown in the UI, e.g. "Tray 1". */
  label: string;
  /** PJL MEDIASOURCE value used by the direct port-9100 path. Verify against the device -
   * Konica/Develop bizhub-family values are typically TRAY1/TRAY2/MANUALFEED. */
  pjl: string;
  /** SumatraPDF `bin=` value used by the Windows agent. Get exact names from
   * `SumatraPDF -list-printers` on the machine with the driver installed. */
  bin: string;
}

export interface PrinterSettings {
  method: PrintMethod;
  direct: { host: string; port: number };
  agent: { printerName: string; token: string };
  trays: Record<TrayKey, TrayConfig>;
  /** Which physical tray each label type prints from. */
  typeToTray: Record<string, TrayKey>;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  method: 'DRY_RUN',
  direct: { host: '', port: 9100 },
  agent: { printerName: 'Develop ineo+ 3320i', token: '' },
  trays: {
    TRAY1: { label: 'Tray 1', pjl: 'TRAY1', bin: 'Tray 1' },
    TRAY2: { label: 'Tray 2', pjl: 'TRAY2', bin: 'Tray 2' },
    BYPASS: { label: 'Bypass Tray', pjl: 'MANUALFEED', bin: 'Bypass Tray' },
  },
  typeToTray: {
    PAL: 'TRAY1',
    FIXTURE: 'TRAY2',
    TRUSS_SPIKE_POSITION: 'TRAY2',
    TRUSS_SPIKE_TIP: 'TRAY2',
    TRUSS_SPIKE_SACN: 'TRAY2',
    CABLE: 'BYPASS',
    RACK: 'BYPASS',
  },
};

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'printerSettings' } });
  if (!row) return structuredClone(DEFAULT_PRINTER_SETTINGS);
  const saved = JSON.parse(row.valueJson) as Partial<PrinterSettings>;
  // Merge over defaults so settings saved by an older version stay valid.
  return {
    ...structuredClone(DEFAULT_PRINTER_SETTINGS),
    ...saved,
    direct: { ...DEFAULT_PRINTER_SETTINGS.direct, ...saved.direct },
    agent: { ...DEFAULT_PRINTER_SETTINGS.agent, ...saved.agent },
    trays: { ...structuredClone(DEFAULT_PRINTER_SETTINGS.trays), ...saved.trays },
    typeToTray: { ...DEFAULT_PRINTER_SETTINGS.typeToTray, ...saved.typeToTray },
  };
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'printerSettings' },
    create: { key: 'printerSettings', valueJson: JSON.stringify(settings) },
    update: { valueJson: JSON.stringify(settings) },
  });
}

export function generateAgentToken(): string {
  return crypto.randomBytes(24).toString('hex');
}
