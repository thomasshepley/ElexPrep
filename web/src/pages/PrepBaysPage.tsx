import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AdminBay, type BarcodeAlias, type PrepConfig, type PrepLine, type UnknownCode } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import { useDialog } from '../components/Dialog';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { Skeleton, SkeletonPanel, SkeletonTableRows } from '../components/Skeleton';
import { formatDateTime } from '../utils/format';

const STATUS_LABEL: Record<string, string> = { OPEN: 'Prepping', AWAITING_TRANSPORT: 'Awaiting transport', BOOKED_OUT: 'Booked out' };

const WRITE_BACK: { value: PrepConfig['rmsWriteBack']; label: string; help: string }[] = [
  { value: 'OFF', label: 'Off', help: 'Nothing is sent to Current RMS. Prep is tracked here only.' },
  { value: 'DRY_RUN', label: 'Dry run', help: 'Nothing is sent, but the activity log records exactly what would have been, so you can check it first.' },
  {
    value: 'LIVE',
    label: 'On',
    help: 'Each scanned unit is marked prepared in Current RMS as it is scanned, and Transport arrived books out everything prepared.',
  },
];

/**
 * Settings > Prep bays: the bays and what each is doing, how the scanners are set up, whether
 * prep writes back to Current RMS, and the barcodes the app has learned.
 */
export default function PrepBaysPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  return (
    <div>
      <h1>Prep bays</h1>
      <p className="muted">
        Each bay has a TV running <Link to="/signage">the prep screen</Link>, signed in with a signage or prep account. Crew then sign in on the screen
        with their own login and see the jobs they are on. A phone pairs with a bay by scanning the QR code under Pair phone on the screen.
      </p>
      {isAdmin && <BaysPanel />}
      <ScannerPanel isAdmin={isAdmin} />
      <BarcodesPanel />
    </div>
  );
}

function online(lastSeenAt: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 2 * 60_000);
}

function BaysPanel() {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [bays, setBays] = useState<AdminBay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.prepAdmin
      .bays()
      .then((b) => {
        setBays(b);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const add = async () => {
    const name = await dialog.prompt({ title: 'Add a bay', label: 'Name', placeholder: 'Bay 1', required: true, confirmLabel: 'Add bay' });
    if (!name) return;
    await api.prepAdmin.createBay(name).catch((e) => showToast((e as Error).message, 'error'));
    load();
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) showToast(done, 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    load();
  };

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>Bays</h2>
        <button type="button" onClick={add}>
          Add bay
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Bay</th>
              <th>Screen</th>
              <th>Signed in</th>
              <th>Job</th>
              <th>Progress</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!bays && !error && <SkeletonTableRows rows={2} cols={6} />}
            {bays?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No bays yet. Add one for each prep screen.
                </td>
              </tr>
            )}
            {bays?.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.name}</strong>
                </td>
                <td>
                  <span className={`chip ${online(b.lastSeenAt) ? 'chip-success' : ''}`}>{online(b.lastSeenAt) ? 'Online' : 'Offline'}</span>
                  {b.lastSeenAt && !online(b.lastSeenAt) && <div className="muted">Last seen {formatDateTime(b.lastSeenAt)}</div>}
                </td>
                <td>{b.operator ? b.operator.name : <span className="muted">Nobody</span>}</td>
                <td>{b.job ? <Link to={`/jobs/${b.job.id}`}>{b.job.name}</Link> : <span className="muted">None</span>}</td>
                <td>
                  {b.progress ? (
                    <>
                      {b.progress.pulled} of {b.progress.required}
                      {b.progress.status && <span className="muted"> · {STATUS_LABEL[b.progress.status]}</span>}
                      {b.progress.flagged && <span className="chip chip-warning"> Missing kit</span>}
                    </>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      const name = await dialog.prompt({ title: 'Rename bay', label: 'Name', defaultValue: b.name, required: true, confirmLabel: 'Rename' });
                      if (name) await act(() => api.prepAdmin.renameBay(b.id, name));
                    }}
                  >
                    Rename
                  </button>
                  {b.operator && (
                    <button type="button" className="secondary" onClick={() => act(() => api.prepAdmin.signOutBay(b.id), `${b.operator!.name} signed out of ${b.name}`)}>
                      Sign out crew
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: `New pairing code for ${b.name}?`,
                        message: 'The screen and any paired phones will need setting up again. Use this if a pairing code has been shared where it should not be.',
                        confirmLabel: 'New code',
                      });
                      if (ok) await act(() => api.prepAdmin.newToken(b.id), 'New pairing code made');
                    }}
                  >
                    New pairing code
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={async () => {
                      const ok = await dialog.confirm({ title: `Delete ${b.name}?`, message: 'Its screen will ask which bay it is next time.', confirmLabel: 'Delete', danger: true });
                      if (ok) await act(() => api.prepAdmin.deleteBay(b.id));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScannerPanel({ isAdmin }: { isAdmin: boolean }) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<PrepConfig | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.prepAdmin
      .config()
      .then(setConfig)
      .catch(() => {});
  }, []);
  if (!config) return <SkeletonPanel lines={5} />;

  const save = async (patch: Partial<PrepConfig>) => {
    setSaving(true);
    try {
      setConfig(await api.prepAdmin.saveConfig(patch));
      showToast('Saved', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Scanners and screens</h2>
      <div className="form-grid settings-grid">
        <label className="field">
          <span className="field-label">Scanner prefix</span>
          <input
            value={config.scannerPrefix}
            maxLength={4}
            onChange={(e) => setConfig({ ...config, scannerPrefix: e.target.value })}
            onBlur={() => save({ scannerPrefix: config.scannerPrefix })}
            placeholder="None"
          />
          <span className="field-help">
            Characters the scanner sends before each code. Set the same on the scanner so a scan can never be mistaken for typing. Leave empty to tell scans
            apart by speed.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Scanner sends after each code</span>
          <select value={config.scannerSuffix} onChange={(e) => save({ scannerSuffix: e.target.value as PrepConfig['scannerSuffix'] })} disabled={saving}>
            <option value="Enter">Enter</option>
            <option value="Tab">Tab</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Sign crew out after (minutes idle)</span>
          <input
            type="number"
            min={1}
            max={720}
            value={config.operatorIdleMinutes}
            onChange={(e) => setConfig({ ...config, operatorIdleMinutes: Number(e.target.value) })}
            onBlur={() => save({ operatorIdleMinutes: config.operatorIdleMinutes })}
          />
        </label>
        <label className="check-field check-field-inline">
          <input type="checkbox" checked={config.sound} onChange={(e) => save({ sound: e.target.checked })} disabled={saving} />
          <span>Beep on scans</span>
        </label>
      </div>
      <p className="field-help">
        Scanners: any USB or Bluetooth 2D scanner set to keyboard mode works. Set its keyboard country to UK (or use keypad emulation) so codes come through
        exactly. Phones work too, from Pair phone on the screen.
      </p>

      <h3>Current RMS</h3>
      {isAdmin ? (
        <fieldset className="radio-stack" disabled={saving}>
          <legend className="visually-hidden">Current RMS write-back</legend>
          {WRITE_BACK.map((w) => (
            <label key={w.value} className="radio-row">
              <input type="radio" name="writeback" checked={config.rmsWriteBack === w.value} onChange={() => save({ rmsWriteBack: w.value })} />
              <span>
                <strong>{w.label}</strong>
                <span className="field-help">{w.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">Current RMS write-back is {WRITE_BACK.find((w) => w.value === config.rmsWriteBack)?.label.toLowerCase()}. Only admins can change it.</p>
      )}
    </section>
  );
}

function BarcodesPanel() {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [unknown, setUnknown] = useState<UnknownCode[] | null>(null);
  const [aliases, setAliases] = useState<BarcodeAlias[] | null>(null);
  const [teaching, setTeaching] = useState<UnknownCode | null>(null);

  const load = useCallback(() => {
    api.prepAdmin.unknownCodes().then(setUnknown).catch(() => setUnknown([]));
    api.prepAdmin.aliases().then(setAliases).catch(() => setAliases([]));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="panel">
      <h2>Barcodes</h2>
      <p className="muted">
        Fixture asset tags and cable barcodes are looked up in Current RMS the first time they are scanned and remembered here. Anything Current RMS does
        not know shows under Not recognised, where you can say what it is.
      </p>
      <h3>Not recognised</h3>
      {!unknown ? (
        <Skeleton h={60} />
      ) : unknown.length === 0 ? (
        <p className="muted">Every scanned barcode has been recognised.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Scanned on</th>
                <th>Times</th>
                <th>Last scanned</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {unknown.map((u) => (
                <tr key={u.code}>
                  <td>
                    <code>{u.code}</code>
                  </td>
                  <td>{u.jobName ?? <span className="muted">Deleted job</span>}</td>
                  <td>{u.count}</td>
                  <td>{formatDateTime(u.lastAt)}</td>
                  <td className="row-actions">
                    {u.jobName && (
                      <button type="button" className="secondary" onClick={() => setTeaching(u)}>
                        Say what this is
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Known barcodes</h3>
      {!aliases ? (
        <Skeleton h={60} />
      ) : aliases.length === 0 ? (
        <p className="muted">None yet. They appear here as kit is scanned.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Item</th>
                <th>Counts as</th>
                <th>From</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code>{a.code}</code>
                  </td>
                  <td>{a.label}</td>
                  <td>{a.kind === 'ASSET' ? 'One unit (scanned once)' : 'Bulk (one per scan)'}</td>
                  <td>{a.source === 'TAUGHT' ? 'Set here' : 'Current RMS'}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={async () => {
                        const ok = await dialog.confirm({ title: `Forget ${a.code}?`, message: 'It will be looked up again next time it is scanned.', confirmLabel: 'Forget' });
                        if (!ok) return;
                        await api.prepAdmin.deleteAlias(a.id).catch((e) => showToast((e as Error).message, 'error'));
                        load();
                      }}
                    >
                      Forget
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {teaching && (
        <TeachDialog
          code={teaching}
          onClose={() => setTeaching(null)}
          onSaved={() => {
            setTeaching(null);
            showToast('Saved. Scan it again on the bay.', 'success');
            load();
          }}
        />
      )}
    </section>
  );
}

function TeachDialog({ code, onClose, onSaved }: { code: UnknownCode; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState<PrepLine[] | null>(null);
  const [lineKey, setLineKey] = useState('');
  const [kind, setKind] = useState<'ASSET' | 'PRODUCT'>('ASSET');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.prepJob
      .view(code.jobId, { phone: true })
      .then((v) => setLines(v.groups.flatMap((g) => g.lines).filter((l) => l.productId !== null)))
      .catch((e) => setError((e as Error).message));
  }, [code.jobId]);
  return (
    <Modal title={`What is ${code.code}?`} onClose={onClose}>
        <p className="muted">Pick the item on {code.jobName}'s pick list this barcode belongs to.</p>
        {error && <p className="error">{error}</p>}
        {!lines && !error && <Skeleton h={40} />}
        {lines && lines.length === 0 && <p className="muted">This job has no Current RMS pick list to link to.</p>}
        {lines && lines.length > 0 && (
          <div className="form-grid settings-grid">
            <label className="field">
              <span className="field-label">Item</span>
              <select value={lineKey} onChange={(e) => setLineKey(e.target.value)}>
                <option value="">Choose an item</option>
                {lines.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Counts as</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'ASSET' | 'PRODUCT')}>
                <option value="ASSET">One unit (an asset tag, scanned once)</option>
                <option value="PRODUCT">Bulk (a product barcode, one per scan)</option>
              </select>
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!lineKey}
            onClick={async () => {
              try {
                await api.prepAdmin.teach({ code: code.code, kind, jobId: code.jobId, lineKey });
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
    </Modal>
  );
}
