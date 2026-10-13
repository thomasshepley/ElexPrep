import { useEffect, useState } from 'react';
import { api, type CrewFeatures, CREW_FEATURE_KEYS, CREW_FEATURE_LABELS } from '../api/client';

/**
 * Company-wide baseline for which crew-portal sections are visible to crew on any job - the
 * starting point every newly-onboarded job's crew-feature checkboxes default to (see
 * JobsListPage's onboarding form), overridable per job afterwards from that job's Settings tab.
 */
export default function CrewPortalSettingsPage() {
  const [features, setFeatures] = useState<CrewFeatures | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.portalSettings.getCrewFeaturesDefault().then(setFeatures).catch((e) => setError(e.message));
  }, []);

  const save = async () => {
    if (!features) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.portalSettings.updateCrewFeaturesDefault(features);
      setFeatures(updated);
      setMessage('Saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!features) return error ? <p className="error">Could not load crew portal settings: {error}</p> : <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>Crew Portal</h1>
      <p className="muted">
        Which sections of a job's crew page are on by default. Every newly-onboarded job starts
        from this; an admin can still turn any of them on or off for an individual job.
      </p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {CREW_FEATURE_KEYS.map((key) => (
            <label key={key} className="row" style={{ gap: '0.4rem' }}>
              <input
                type="checkbox"
                checked={features[key]}
                onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
              />
              {CREW_FEATURE_LABELS[key]}
            </label>
          ))}
        </div>
        <button onClick={save} disabled={busy}>
          Save
        </button>
      </div>
    </div>
  );
}
