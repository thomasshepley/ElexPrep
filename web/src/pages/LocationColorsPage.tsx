import { useEffect, useState } from 'react';
import { api, type LocationColorRule } from '../api/client';

function contrastingText(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#fff';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.55 ? '#fff' : '#000';
}

export default function LocationColorsPage() {
  const [rules, setRules] = useState<LocationColorRule[]>([]);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#1FA34C');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.locationColorRules.list().then(setRules).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.locationColorRules.create({ location, color });
      setLocation('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateColor = async (rule: LocationColorRule, value: string) => {
    await api.locationColorRules.update(rule.id, { color: value });
    refresh();
  };

  const remove = async (id: string) => {
    await api.locationColorRules.remove(id);
    refresh();
  };

  return (
    <div>
      <h1>Location colors</h1>
      <p className="muted">
        Colors the PAL label's location bar so crew can spot a case's stage position at a
        glance. Match the location string exactly as it appears on the patch/ad hoc label
        (case-insensitive) — a location with no rule here prints with a neutral dark bar.
      </p>
      <div className="panel">
        <h3>Add rule</h3>
        <form className="row" onSubmit={create}>
          <input placeholder="Location (e.g. Downstage)" value={location} onChange={(e) => setLocation(e.target.value)} required />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <button type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Location</th>
            <th>Color</th>
            <th>Preview</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.location}</td>
              <td>
                <input type="color" value={r.color} onChange={(e) => updateColor(r, e.target.value)} />
              </td>
              <td>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 4,
                    background: r.color,
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
  );
}
