import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATCH_FIELD_LABELS, type PatchFieldKey } from '@elexprep/shared';
import { api, type Fixture, type PatchImportCandidate } from '../api/client';
import FileInput from './FileInput';
import { useToast } from './Toast';

function announceNewFixtureTypes(showToast: ReturnType<typeof useToast>['showToast'], types: string[]) {
  if (types.length === 0) return;
  const list = types.length <= 3 ? types.join(', ') : `${types.slice(0, 3).join(', ')} +${types.length - 3} more`;
  showToast(
    `${types.length === 1 ? 'New fixture type' : 'New fixture types'} added to case rules: ${list}`,
    'info'
  );
}

export default function PatchImportPanel({ jobId }: { jobId: string }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [savedMapping, setSavedMapping] = useState<Record<string, string> | null>(null);
  const [missingColumns, setMissingColumns] = useState<{ field: string; column: string }[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState('');

  const [candidate, setCandidate] = useState<PatchImportCandidate | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const loadFixtures = () => api.patch.fixtures(jobId).then(setFixtures);
  const loadCandidate = () => api.patch.getOneDriveCandidate(jobId).then(setCandidate);

  useEffect(() => {
    loadFixtures();
    loadCandidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const scanOneDrive = async () => {
    setScanBusy(true);
    setScanError(null);
    try {
      const res = await api.patch.scanOneDrive(jobId);
      if (res.candidate) setCandidate(res.candidate);
      else if (!res.detected) setScanError('No patch CSV in the "Patch" folder, and no usable table found in the CAD PDF either.');
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanBusy(false);
    }
  };

  const approveCandidate = async () => {
    setScanBusy(true);
    setScanError(null);
    try {
      const res = await api.patch.approveOneDriveCandidate(jobId);
      setCandidate(res.candidate);
      await loadFixtures();
      showToast(`Imported ${res.imported} fixtures`);
      announceNewFixtureTypes(showToast, res.newFixtureTypes);
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanBusy(false);
    }
  };

  const rejectCandidate = async () => {
    const note = prompt('Rejection note (optional):') ?? '';
    setScanBusy(true);
    setScanError(null);
    try {
      const res = await api.patch.rejectOneDriveCandidate(jobId, note || undefined);
      setCandidate(res.candidate);
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!fixtures) return;
    setSelected((s) => (s.size === fixtures.length ? new Set() : new Set(fixtures.map((f) => f.id))));
  };

  /** Groups fixtures by type (sorted alphabetically, address order preserved within each
   * group) so a patch with many fixture types reads as sections instead of one long flat
   * list sorted only by address. */
  const fixtureGroups = (fixtures ?? []).reduce<{ type: string; items: Fixture[] }[]>((groups, f) => {
    const type = f.fixtureType || 'Unlabeled';
    let group = groups.find((g) => g.type === type);
    if (!group) {
      group = { type, items: [] };
      groups.push(group);
    }
    group.items.push(f);
    return groups;
  }, []).sort((a, b) => a.type.localeCompare(b.type));

  const bulkSetLocation = async () => {
    await api.patch.bulkSetLocation(jobId, [...selected], bulkLocation);
    setBulkLocation('');
    setSelected(new Set());
    loadFixtures();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} selected fixtures?`)) return;
    await api.patch.bulkRemoveFixtures(jobId, [...selected]);
    setSelected(new Set());
    loadFixtures();
  };

  const updateFixture = async (f: Fixture, field: keyof Fixture, rawValue: string) => {
    const isNumeric = ['address', 'mainUniverse', 'mainAddress', 'pixUniverse', 'pixAddress'].includes(field);
    const value = isNumeric ? (rawValue === '' ? null : Number(rawValue)) : rawValue || null;
    if (value === (f[field] ?? null)) return;
    try {
      await api.patch.updateFixture(jobId, f.id, { [field]: value } as Partial<Fixture>);
      loadFixtures();
    } catch (e) {
      alert((e as Error).message);
      loadFixtures();
    }
  };

  const removeFixture = async (id: string) => {
    if (!confirm('Delete this fixture?')) return;
    await api.patch.removeFixture(jobId, id);
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    loadFixtures();
  };

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
      showToast(`Imported ${res.imported} fixtures`);
      announceNewFixtureTypes(showToast, res.newFixtureTypes);
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
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>OneDrive patch import</h3>
          <button className="secondary" onClick={scanOneDrive} disabled={scanBusy}>
            Scan OneDrive for patch file
          </button>
        </div>
        <p className="muted">
          Looks for a CSV in this job's OneDrive "Patch" subfolder, falling back to extracting a
          table from the CAD PDF if there's no CSV. Nothing is applied automatically - a detected
          file sits here for review until approved.
        </p>
        {scanError && <p className="error">{scanError}</p>}

        {candidate && candidate.status === 'PENDING' && (
          <div className="row panel" style={{ background: 'rgba(255,255,255,0.04)', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div>
              <strong>{candidate.fileName}</strong>
              {candidate.extractedFrom === 'pdf' && <span className="chip chip-warning"> Extracted from CAD PDF</span>}
              <p className="muted" style={{ margin: 0 }}>
                {candidate.rowCount} rows &middot; detected {new Date(candidate.detectedAt).toLocaleString()} &middot;{' '}
                {candidate.oneDriveItemPath}
              </p>
              {candidate.extractedFrom === 'pdf' && (
                <p className="error" style={{ margin: '0.3rem 0 0' }}>
                  No patch CSV was found - these rows were lifted from the CAD PDF by fuzzy table
                  extraction, not a real export. Check them carefully before approving.
                </p>
              )}
            </div>
            <button onClick={approveCandidate} disabled={scanBusy}>
              Approve &amp; import
            </button>
            <button className="secondary" onClick={rejectCandidate} disabled={scanBusy}>
              Reject
            </button>
          </div>
        )}
        {candidate && candidate.status === 'APPROVED' && (
          <p className="muted">
            Last approved: {candidate.fileName} ({candidate.rowCount} rows), {new Date(candidate.reviewedAt ?? candidate.detectedAt).toLocaleString()}.
          </p>
        )}
        {candidate && candidate.status === 'REJECTED' && (
          <p className="muted">
            Last detected file ({candidate.fileName}) was rejected
            {candidate.rejectionNote ? `: ${candidate.rejectionNote}` : '.'}
          </p>
        )}
      </div>

      <div className="panel">
        <h3>Upload Wysiwyg patch CSV</h3>
        <p className="muted">
          Columns are mapped using the saved layout from{' '}
          <Link to="/settings/import-mapping">Settings → Import Mapping</Link> - no need to remap
          each time.
        </p>
        <FileInput accept=".csv" onFile={onFile} label="Choose CSV" />
        {error && <p className="error">{error}</p>}
      </div>

      {fileName && (
        <div className="panel">
          <h3>Ready to import - {fileName}</h3>
          <p className="muted">{rows.length} rows found.</p>

          {!mappingOk && (
            <p className="error">
              No saved column mapping yet - set it up in{' '}
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
                          <span className="error"> - not in this file</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {requiredMissing && (
                <p className="error">
                  This file is missing the mapped Address/Fixture Type columns - check the file or
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
          <>
            <p className="muted">Every field is editable in place (click and type, saves on blur).</p>
            {selected.size > 0 && (
              <div className="row panel" style={{ background: 'rgba(255,255,255,0.04)', alignItems: 'center', gap: '0.6rem' }}>
                <strong>{selected.size} selected</strong>
                <input
                  placeholder="Set location to…"
                  value={bulkLocation}
                  onChange={(e) => setBulkLocation(e.target.value)}
                  style={{ width: 160 }}
                />
                <button onClick={bulkSetLocation}>Set location</button>
                <button className="secondary" onClick={bulkDelete}>
                  Delete selected
                </button>
                <button className="secondary" onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selected.size === fixtures.length && fixtures.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Main Uni</th>
                  <th>Main Addr</th>
                  <th>Pix Uni</th>
                  <th>Pix Addr</th>
                  <th>Mode</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fixtureGroups.map((group) => (
                  <Fragment key={group.type}>
                    <tr>
                      <td colSpan={10} style={{ fontWeight: 700, paddingTop: '0.75rem' }}>
                        {group.type} <span className="muted" style={{ fontWeight: 400 }}>({group.items.length})</span>
                      </td>
                    </tr>
                    {group.items.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelected(f.id)} />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={f.address}
                        style={{ width: 60 }}
                        onBlur={(e) => updateFixture(f, 'address', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={f.fixtureType}
                        style={{ width: 150 }}
                        onBlur={(e) => updateFixture(f, 'fixtureType', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={f.mainUniverse ?? ''}
                        style={{ width: 55 }}
                        onBlur={(e) => updateFixture(f, 'mainUniverse', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={f.mainAddress ?? ''}
                        style={{ width: 55 }}
                        onBlur={(e) => updateFixture(f, 'mainAddress', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={f.pixUniverse ?? ''}
                        style={{ width: 55 }}
                        onBlur={(e) => updateFixture(f, 'pixUniverse', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={f.pixAddress ?? ''}
                        style={{ width: 55 }}
                        onBlur={(e) => updateFixture(f, 'pixAddress', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={f.mode ?? ''}
                        style={{ width: 120 }}
                        onBlur={(e) => updateFixture(f, 'mode', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={f.location ?? ''}
                        style={{ width: 120 }}
                        onBlur={(e) => updateFixture(f, 'location', e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="secondary" onClick={() => removeFixture(f.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
