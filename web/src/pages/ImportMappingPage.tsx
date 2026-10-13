import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import {
  PATCH_FIELD_KEYS,
  PATCH_FIELD_LABELS,
  PATCH_FIELD_SYNONYMS,
  findHeaderRowIndex,
  type PatchFieldKey,
} from '@elexprep/shared';
import { api } from '../api/client';
import FileInput from '../components/FileInput';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/roles';
import PermissionFieldset from '../components/PermissionFieldset';

const PREP_SETTINGS_NOTE = 'You can view these settings, but changing them needs the "Manage prep settings" permission.';

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

/**
 * The patch export format is normally identical between jobs, so the CSV column mapping
 * is configured once here and every import uses it automatically.
 */
export default function ImportMappingPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'managePrepSettings');
  const [mapping, setMapping] = useState<Partial<Record<PatchFieldKey, string>>>({});
  const [sampleHeaders, setSampleHeaders] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get<Partial<Record<PatchFieldKey, string>>>('patchMapping').then(({ value }) => {
      if (value) setMapping(value);
    });
  }, []);

  const onSampleFile = (file: File) => {
    // Real patch exports (e.g. Wysiwyg's patch report) often have a few title/metadata rows
    // before the actual column header row, so the header can't just be assumed to be row 1.
    Papa.parse<string[]>(file, {
      preview: 40,
      complete: (res) => {
        const rows = res.data as string[][];
        const headerRowIndex = findHeaderRowIndex(rows);
        const headers = (rows[headerRowIndex] ?? []).map((h) => (h ?? '').trim()).filter(Boolean);
        setSampleHeaders(headers);
        // Auto-guess unmapped fields from the sample's headers, using known synonyms for
        // common patch-export column names (e.g. "Spot" for address, "Patch" for a combined
        // universe.address, "Position" for stage location) as well as an exact key match.
        setMapping((m) => {
          const next = { ...m };
          const used = new Set(Object.values(next));
          for (const key of PATCH_FIELD_KEYS) {
            if (next[key]) continue;
            const candidates = [key.toLowerCase(), ...PATCH_FIELD_SYNONYMS[key]];
            const match = headers.find((h) => !used.has(h) && candidates.includes(normalizeHeader(h)));
            if (match) {
              next[key] = match;
              used.add(match);
            }
          }
          return next;
        });
      },
    });
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!mapping.address || !mapping.fixtureType) {
      setError('Address and Fixture Type must be mapped.');
      return;
    }
    const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v && v.trim() !== ''));
    await api.settings.put('patchMapping', cleaned);
    setSaved(true);
  };

  return (
    <div>
      <h1>Import mapping</h1>
      <PermissionFieldset allowed={canEdit} note={PREP_SETTINGS_NOTE}>
      <p className="muted" style={{ maxWidth: 640 }}>
        Set once which CSV columns from your Wysiwyg patch export map onto each field - every
        patch import then uses this automatically. Upload a sample export to pick columns from a
        list instead of typing them.
      </p>

      <div className="panel">
        <h3>Sample CSV (optional)</h3>
        <FileInput accept=".csv" onFile={onSampleFile} label="Choose CSV" />
        {sampleHeaders.length > 0 && (
          <p className="muted">Columns found: {sampleHeaders.join(', ')}</p>
        )}
      </div>

      <div className="panel">
        <h3>Column mapping</h3>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>CSV column name</th>
            </tr>
          </thead>
          <tbody>
            {PATCH_FIELD_KEYS.map((key) => (
              <tr key={key}>
                <td>
                  {PATCH_FIELD_LABELS[key]}
                  {(key === 'address' || key === 'fixtureType') && <span className="error"> *</span>}
                </td>
                <td>
                  <input
                    list={sampleHeaders.length ? 'sample-headers' : undefined}
                    value={mapping[key] ?? ''}
                    placeholder="- not mapped -"
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    style={{ width: 260 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sampleHeaders.length > 0 && (
          <datalist id="sample-headers">
            {sampleHeaders.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        )}
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button onClick={save}>Save mapping</button>
          {saved && <span className="muted">Saved ✓</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </div>
      </PermissionFieldset>
    </div>
  );
}
