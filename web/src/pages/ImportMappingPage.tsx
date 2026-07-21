import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { PATCH_FIELD_KEYS, PATCH_FIELD_LABELS, type PatchFieldKey } from '@elexprep/shared';
import { api } from '../api/client';

/**
 * The patch export format is normally identical between jobs, so the CSV column mapping
 * is configured once here and every import uses it automatically.
 */
export default function ImportMappingPage() {
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
    Papa.parse(file, {
      header: true,
      preview: 1,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        setSampleHeaders(headers);
        // Auto-guess unmapped fields from the sample's headers.
        setMapping((m) => {
          const next = { ...m };
          for (const key of PATCH_FIELD_KEYS) {
            if (next[key]) continue;
            const match = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, '') === key.toLowerCase());
            if (match) next[key] = match;
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
      <p className="muted" style={{ maxWidth: 640 }}>
        Set once which CSV columns from your Wysiwyg patch export map onto each field — every
        patch import then uses this automatically. Upload a sample export to pick columns from a
        list instead of typing them.
      </p>

      <div className="panel">
        <h3>Sample CSV (optional)</h3>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && onSampleFile(e.target.files[0])}
        />
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
                    placeholder="— not mapped —"
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
    </div>
  );
}
