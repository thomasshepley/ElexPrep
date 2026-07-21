import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PATCH_FIELD_LABELS, type PatchFieldKey } from '@elexprep/shared';
import { api, type Fixture } from '../api/client';

export default function PatchImportPanel({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [savedMapping, setSavedMapping] = useState<Record<string, string> | null>(null);
  const [missingColumns, setMissingColumns] = useState<{ field: string; column: string }[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFixtures = () => api.patch.fixtures(jobId).then(setFixtures);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const res = await api.patch.preview(jobId, file);
      setRows(res.rows);
      setSavedMapping(res.savedMapping);
      setMissingColumns(res.missingColumns);
      setFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch.import(jobId, rows);
      await loadFixtures();
      setRows([]);
      setFileName(null);
      alert(`Imported ${res.imported} fixtures`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mappingOk = savedMapping && savedMapping.address && savedMapping.fixtureType;
  const requiredMissing = missingColumns.some(
    (m) => m.field === 'address' || m.field === 'fixtureType'
  );

  return (
    <div>
      <div className="panel">
        <h3>Upload Wysiwyg patch CSV</h3>
        <p className="muted">
          Columns are mapped using the saved layout from{' '}
          <Link to="/settings/import-mapping">Settings → Import Mapping</Link> — no need to remap
          each time.
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        {error && <p className="error">{error}</p>}
      </div>

      {fileName && (
        <div className="panel">
          <h3>Ready to import — {fileName}</h3>
          <p className="muted">{rows.length} rows found.</p>

          {!mappingOk && (
            <p className="error">
              No saved column mapping yet — set it up in{' '}
              <Link to="/settings/import-mapping">Settings → Import Mapping</Link> first.
            </p>
          )}

          {mappingOk && (
            <>
              <table style={{ maxWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>CSV column</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(savedMapping).map(([field, column]) => (
                    <tr key={field}>
                      <td>{PATCH_FIELD_LABELS[field as PatchFieldKey] ?? field}</td>
                      <td>
                        {column}
                        {missingColumns.some((m) => m.field === field) && (
                          <span className="error"> — not in this file</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {requiredMissing && (
                <p className="error">
                  This file is missing the mapped Address/Fixture Type columns — check the file or
                  update the mapping in Settings.
                </p>
              )}
              {!requiredMissing && missingColumns.length > 0 && (
                <p className="muted">
                  Optional mapped columns missing from this file will import as blank.
                </p>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <button onClick={doImport} disabled={busy || requiredMissing}>
                  Import {rows.length} fixtures
                </button>
              </div>
            </>
          )}
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
