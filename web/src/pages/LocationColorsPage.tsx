import { SkeletonTableRows } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { api, type LocationColorPattern, type LocationColorRule } from '../api/client';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/roles';
import PermissionFieldset from '../components/PermissionFieldset';
import CommitColorInput from '../components/CommitColorInput';

const PREP_SETTINGS_NOTE = 'You can view these settings, but changing them needs the "Manage prep settings" permission.';

function contrastingText(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#fff';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.55 ? '#fff' : '#000';
}

const RAINBOW_CSS = 'linear-gradient(90deg, #D32F2F, #F57C00, #F5C400, #1FA34C, #1976D2, #4B0082)';

/** CSS approximation of the PDF's diagonal hazard stripes / rainbow band, for the in-browser
 * preview swatch. */
function swatchBackground(rule: Pick<LocationColorRule, 'color' | 'pattern' | 'secondaryColor'>): string {
  if (rule.pattern === 'RAINBOW') return RAINBOW_CSS;
  if (rule.pattern === 'DIAGONAL_STRIPES' && rule.secondaryColor) {
    return `repeating-linear-gradient(45deg, ${rule.color}, ${rule.color} 10px, ${rule.secondaryColor} 10px, ${rule.secondaryColor} 20px)`;
  }
  return rule.color;
}

export default function LocationColorsPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'managePrepSettings');
  const { showToast } = useToast();
  const [rulesLoaded, setRules] = useState<LocationColorRule[] | null>(null);
  const rules = rulesLoaded ?? [];
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#1FA34C');
  const [pattern, setPattern] = useState<LocationColorPattern>('SOLID');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.locationColorRules.list().then(setRules).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.locationColorRules.create({
        location,
        color,
        pattern,
        ...(pattern === 'DIAGONAL_STRIPES' ? { secondaryColor } : {}),
      });
      setLocation('');
      setPattern('SOLID');
      refresh();
      showToast(`Added "${location}" to location colors`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateColor = async (rule: LocationColorRule, value: string) => {
    await api.locationColorRules.update(rule.id, { color: value });
    refresh();
  };

  const updatePattern = async (rule: LocationColorRule, value: LocationColorPattern) => {
    await api.locationColorRules.update(rule.id, {
      pattern: value,
      secondaryColor: value === 'DIAGONAL_STRIPES' ? rule.secondaryColor ?? '#FFFFFF' : null,
    });
    refresh();
  };

  const updateSecondaryColor = async (rule: LocationColorRule, value: string) => {
    await api.locationColorRules.update(rule.id, { secondaryColor: value });
    refresh();
  };

  const remove = async (id: string) => {
    await api.locationColorRules.remove(id);
    refresh();
    showToast('Location color removed', 'info');
  };

  return (
    <div>
      <h1>Location colors</h1>
      <PermissionFieldset allowed={canEdit} note={PREP_SETTINGS_NOTE}>
      <p className="muted">
        Colors the PAL label's location bar so crew can spot a case's stage position at a
        glance. Match the location string exactly as it appears on the patch/ad hoc label
        (case-insensitive) - a location with no rule here prints with a neutral dark bar.
      </p>
      <div className="panel">
        <h3>Add rule</h3>
        <form className="row" onSubmit={create}>
          <input aria-label="Location" placeholder="Location (e.g. Downstage)" value={location} onChange={(e) => setLocation(e.target.value)} required />
          {pattern !== 'RAINBOW' && <input type="color" value={color} aria-label="Colour" onChange={(e) => setColor(e.target.value)} />}
          <select value={pattern} onChange={(e) => setPattern(e.target.value as LocationColorPattern)}>
            <option value="SOLID">Solid</option>
            <option value="DIAGONAL_STRIPES">Diagonal stripes (hazard)</option>
            <option value="RAINBOW">Rainbow (not tied to one spot)</option>
          </select>
          {pattern === 'DIAGONAL_STRIPES' && (
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} title="Second stripe colour" aria-label="Second stripe colour" />
          )}
          <button type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="table-scroll">
        <table>
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
            {rulesLoaded === null && <SkeletonTableRows rows={8} cols={6} />}
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{r.location}</td>
                <td>
                  <div className="row" style={{ gap: '0.3rem' }}>
                    {r.pattern !== 'RAINBOW' && <CommitColorInput value={r.color} ariaLabel={`${r.location} colour`} onCommit={(v) => updateColor(r, v)} />}
                    {r.pattern === 'DIAGONAL_STRIPES' && (
                      <CommitColorInput value={r.secondaryColor ?? '#FFFFFF'} title={`${r.location} second stripe colour`} onCommit={(v) => updateSecondaryColor(r, v)} />
                    )}
                    {r.pattern === 'RAINBOW' && <span className="muted">(fixed colors)</span>}
                  </div>
                </td>
                <td>
                  <select value={r.pattern} onChange={(e) => updatePattern(r, e.target.value as LocationColorPattern)}>
                    <option value="SOLID">Solid</option>
                    <option value="DIAGONAL_STRIPES">Diagonal stripes</option>
                    <option value="RAINBOW">Rainbow</option>
                  </select>
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: 4,
                      background: swatchBackground(r),
                      color: r.pattern === 'RAINBOW' ? '#fff' : contrastingText(r.color),
                      textShadow: r.pattern === 'RAINBOW' ? '0 1px 2px rgba(0,0,0,0.8)' : undefined,
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
      </PermissionFieldset>
    </div>
  );
}
