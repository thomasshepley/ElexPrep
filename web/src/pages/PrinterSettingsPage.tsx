import { useEffect, useState } from 'react';
import { api, type PrinterSettings, type PrintMethod, type TrayKey } from '../api/client';
import { useDialog } from '../components/Dialog';
import { labelTypeName } from '../utils/labelTypes';

const METHODS: { value: PrintMethod; label: string; help: string }[] = [
  {
    value: 'DRY_RUN',
    label: 'Dry run (no printing)',
    help: 'Print jobs are created and marked sent without touching any hardware - use this for testing and in Docker until the printer is wired up.',
  },
  {
    value: 'DIRECT_9100',
    label: 'Direct network (port 9100)',
    help: 'The server sends PJL-wrapped PDF straight to the printer IP - no Windows machine needed, but PJL tray values must match the device firmware.',
  },
  {
    value: 'AGENT',
    label: 'Windows agent (SumatraPDF)',
    help: 'Jobs queue on the server and the agent on the office Windows machine prints them through the real driver - most reliable tray selection. See agent/README.md.',
  },
];

const TRAY_KEYS: TrayKey[] = ['TRAY1', 'TRAY2', 'BYPASS'];
const LABEL_TYPES = ['PAL', 'FIXTURE', 'TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'CABLE', 'RACK'];

export default function PrinterSettingsPage() {
  const dialog = useDialog();
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.printerSettings.get().then(setSettings).catch((e) => setLoadError((e as Error).message));
  }, []);

  if (!settings) return loadError ? <p className="error">Could not load printer settings: {loadError}</p> : <p className="muted">Loading…</p>;

  const update = (patch: Partial<PrinterSettings>) => setSettings({ ...settings, ...patch });

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.printerSettings.put(settings);
      setSettings(saved);
      setMessage('Saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.printerSettings.testConnection(settings.direct.host, settings.direct.port);
      setMessage(res.message ?? 'Connected.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const regenerateToken = async () => {
    if (!(await dialog.confirm({ title: 'Generate a new agent token?', message: 'The current token stops working immediately - the print agent needs the new one before it can print again.', confirmLabel: 'Generate token', danger: true }))) return;
    const updated = await api.printerSettings.regenerateToken();
    setSettings(updated);
    setMessage('New token generated - update agent-config.json on the print machine.');
  };

  return (
    <div>
      <h1>Printer settings</h1>
      <p className="muted">Develop ineo+ 3320i tray routing and delivery method.</p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Delivery method</h3>
        {METHODS.map((m) => (
          <label key={m.value} style={{ display: 'block', marginBottom: '0.6rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="method"
              checked={settings.method === m.value}
              onChange={() => update({ method: m.value })}
            />{' '}
            <strong>{m.label}</strong>
            <div className="muted" style={{ marginLeft: '1.4rem' }}>{m.help}</div>
          </label>
        ))}
      </div>

      {settings.method === 'DIRECT_9100' && (
        <div className="panel">
          <h3>Direct network</h3>
          <div className="row">
            <label className="field">
              <span className="field-label">Printer IP</span>
              <input
                value={settings.direct.host}
                placeholder="e.g. 192.168.1.50"
                onChange={(e) => update({ direct: { ...settings.direct, host: e.target.value } })}
              />
            </label>
            <label className="field">
              <span className="field-label">Port</span>
              <input
                type="number"
                value={settings.direct.port}
                style={{ width: 90 }}
                onChange={(e) => update({ direct: { ...settings.direct, port: Number(e.target.value) } })}
              />
            </label>
            <button className="secondary" onClick={testConnection} disabled={busy} style={{ alignSelf: 'flex-end' }}>
              Test connection
            </button>
          </div>
        </div>
      )}

      {settings.method === 'AGENT' && (
        <div className="panel">
          <h3>Windows agent</h3>
          <label className="field">
            <span className="field-label">Windows printer name (exactly as shown by SumatraPDF -list-printers)</span>
            <input
              value={settings.agent.printerName}
              style={{ width: 320 }}
              onChange={(e) => update({ agent: { ...settings.agent, printerName: e.target.value } })}
            />
          </label>
          <div style={{ marginTop: '0.75rem' }}>
            <h4>Agent token</h4>
            {settings.agent.token ? (
              <code style={{ userSelect: 'all' }}>{settings.agent.token}</code>
            ) : (
              <p className="muted">No token yet - generate one and paste it into agent-config.json.</p>
            )}
            <div style={{ marginTop: '0.5rem' }}>
              <button className="secondary" onClick={regenerateToken}>
                {settings.agent.token ? 'Regenerate token' : 'Generate token'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Trays</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tray</th>
                <th>Display name</th>
                <th>PJL value (direct mode)</th>
                <th>Agent bin (SumatraPDF)</th>
              </tr>
            </thead>
            <tbody>
              {TRAY_KEYS.map((key) => (
                <tr key={key}>
                  <td>{key}</td>
                  {(['label', 'pjl', 'bin'] as const).map((field) => (
                    <td key={field}>
                      <input
                        value={settings.trays[key][field]}
                        onChange={(e) =>
                          update({
                            trays: {
                              ...settings.trays,
                              [key]: { ...settings.trays[key], [field]: e.target.value },
                            },
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          PJL values are typically TRAY1 / TRAY2 / MANUALFEED on the bizhub/ineo family; confirm by
          capturing a driver print job if the wrong tray fires. Agent bin names come from
          `SumatraPDF -list-printers` on the print machine.
        </p>
      </div>

      <div className="panel">
        <h3>Label type → tray</h3>
        <div className="table-scroll">
          <table style={{ maxWidth: 480 }}>
            <tbody>
              {LABEL_TYPES.map((t) => (
                <tr key={t}>
                  <td>{labelTypeName(t)}</td>
                  <td>
                    <select
                      value={settings.typeToTray[t] ?? 'BYPASS'}
                      onChange={(e) =>
                        update({ typeToTray: { ...settings.typeToTray, [t]: e.target.value as TrayKey } })
                      }
                    >
                      {TRAY_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {settings.trays[k].label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button onClick={save} disabled={busy}>
        Save printer settings
      </button>
    </div>
  );
}
