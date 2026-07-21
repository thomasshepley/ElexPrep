import { useState } from 'react';
import { PATCH_FIELD_KEYS, PATCH_FIELD_LABELS, type PatchFieldKey } from '@elexprep/shared';
import { api, type Fixture } from '../api/client';

export default function PatchImportPanel({ jobId }: { jobId: string }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<PatchFieldKey, string>>>({});
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFixtures = () => api.patch.fixtures(jobId).then(setFixtures);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const res = await api.patch.preview(jobId, file);
      setHeaders(res.headers);
      setRows(res.rows);
      const guess: Partial<Record<PatchFieldKey, string>> = {};
      for (const key of PATCH_FIELD_KEYS) {
        const match = res.headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === key.toLowerCase());
        if (match) guess[key] = match;
      }
      setMapping(guess);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch.import(jobId, mapping as Record<string, string>, rows);
      await loadFixtures();
      setHeaders([]);
      setRows([]);
      alert(`Imported ${res.imported} fixtures`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <h3>1. Upload Wysiwyg patch CSV</h3>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {error && <p className="error">{error}</p>}
      </div>

      {headers.length > 0 && (
        <div className="panel">
          <h3>2. Map columns</h3>
          <p className="muted">{rows.length} rows found. Address and Fixture Type are required.</p>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>CSV column</th>
              </tr>
            </thead>
            <tbody>
              {PATCH_FIELD_KEYS.map((key) => (
                <tr key={key}>
                  <td>{PATCH_FIELD_LABELS[key]}</td>
                  <td>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value || undefined }))}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '0.75rem' }}>
            <button onClick={doImport} disabled={busy || !mapping.address || !mapping.fixtureType}>
              Import {rows.length} fixtures
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Imported fixtures</h3>
          <button className="secondary" onClick={loadFixtures}>
            Refresh
          </button>
        </div>
        {!fixtures && <p className="muted">Not loaded yet.</p>}
        {fixtures && fixtures.length === 0 && <p className="muted">No fixtures imported yet.</p>}
        {fixtures && fixtures.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Type</th>
                <th>Main</th>
                <th>Pix</th>
                <th>Mode</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f) => (
                <tr key={f.id}>
                  <td>{f.address}</td>
                  <td>{f.fixtureType}</td>
                  <td>{f.mainUniverse != null ? `Uni ${f.mainUniverse} / ${f.mainAddress}` : ''}</td>
                  <td>{f.pixUniverse != null ? `Uni ${f.pixUniverse} / ${f.pixAddress}` : ''}</td>
                  <td>{f.mode}</td>
                  <td>{f.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
