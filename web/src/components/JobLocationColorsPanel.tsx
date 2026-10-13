import { useEffect, useState } from 'react';
import { api, type LocationColorPattern, type LocationColorRule } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/roles';

function contrastingText(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#fff';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.55 ? '#fff' : '#000';
}

/** CSS approximation of the PDF's diagonal hazard stripes, for the in-browser preview swatch. */
function swatchBackground(rule: Pick<LocationColorRule, 'color' | 'pattern' | 'secondaryColor'>): string {
  if (rule.pattern === 'DIAGONAL_STRIPES' && rule.secondaryColor) {
    return `repeating-linear-gradient(45deg, ${rule.color}, ${rule.color} 10px, ${rule.secondaryColor} 10px, ${rule.secondaryColor} 20px)`;
  }
  return rule.color;
}

/**
 * Per-job location color overrides - for jobs whose patch uses stage location names that
 * don't match the house defaults in Settings -> Location Colors (e.g. "Cube North", "Entrance
 * Arch Top" instead of "Floor"/"Downstage"/etc). A rule added here only affects this job's PAL
 * labels, and takes precedence over a global rule of the same name if one exists.
 */
export default function JobLocationColorsPanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'editJobs');
  const [rules, setRules] = useState<LocationColorRule[]>([]);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#1FA34C');
  const [pattern, setPattern] = useState<LocationColorPattern>('SOLID');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobLocationColorRules.list(jobId).then(setRules).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.jobLocationColorRules.create(jobId, {
        location,
        color,
        pattern,
        ...(pattern === 'DIAGONAL_STRIPES' ? { secondaryColor } : {}),
      });
      setLocation('');
      setPattern('SOLID');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateColor = async (rule: LocationColorRule, value: string) => {
    await api.jobLocationColorRules.update(jobId, rule.id, { color: value });
    refresh();
  };

  const updatePattern = async (rule: LocationColorRule, value: LocationColorPattern) => {
    await api.jobLocationColorRules.update(jobId, rule.id, {
      pattern: value,
      secondaryColor: value === 'DIAGONAL_STRIPES' ? rule.secondaryColor ?? '#FFFFFF' : null,
    });
    refresh();
  };

  const updateSecondaryColor = async (rule: LocationColorRule, value: string) => {
    await api.jobLocationColorRules.update(jobId, rule.id, { secondaryColor: value });
    refresh();
  };

  const remove = async (id: string) => {
    await api.jobLocationColorRules.remove(jobId, id);
    refresh();
  };

  return (
    <div>
      <h4>Location colors (this job only)</h4>
      <p className="muted">
        Overrides/adds to the global defaults in{' '}
        <a href="/settings/location-colors" target="_blank" rel="noreferrer">
          Settings → Location Colors
        </a>{' '}
        for jobs whose patch uses different location names - match the location exactly as it
        appears in this job's patch (case-insensitive).
      </p>
      {canEdit && (
      <form className="row" onSubmit={create}>
        <input
          placeholder="Location (e.g. Cube North)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <select value={pattern} onChange={(e) => setPattern(e.target.value as LocationColorPattern)}>
          <option value="SOLID">Solid</option>
          <option value="DIAGONAL_STRIPES">Diagonal stripes (hazard)</option>
        </select>
        {pattern === 'DIAGONAL_STRIPES' && (
          <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} title="Second stripe color" />
        )}
        <button type="submit">Add override</button>
      </form>
      )}
      {error && <p className="error">{error}</p>}

      {rules.length > 0 && (
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="table-scroll">
          <table style={{ marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th>Location</th>
                <th>Color</th>
                <th>Pattern</th>
                <th>Preview</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.location}</td>
                  <td className="row" style={{ gap: '0.3rem' }}>
                    <input type="color" value={r.color} onChange={(e) => updateColor(r, e.target.value)} />
                    {r.pattern === 'DIAGONAL_STRIPES' && (
                      <input
                        type="color"
                        value={r.secondaryColor ?? '#FFFFFF'}
                        title="Second stripe color"
                        onChange={(e) => updateSecondaryColor(r, e.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    <select value={r.pattern} onChange={(e) => updatePattern(r, e.target.value as LocationColorPattern)}>
                      <option value="SOLID">Solid</option>
                      <option value="DIAGONAL_STRIPES">Diagonal stripes</option>
                    </select>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: 4,
                        background: swatchBackground(r),
                        color: contrastingText(r.color),
                        fontWeight: 600,
                      }}
                    >
                      {r.location}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => remove(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </fieldset>
      )}
      {rules.length === 0 && <p className="muted">No overrides yet for this job.</p>}
    </div>
  );
}
