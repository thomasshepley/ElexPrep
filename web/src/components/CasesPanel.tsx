import { useEffect, useState } from 'react';
import { api, type CaseGroup } from '../api/client';

export default function CasesPanel({ jobId }: { jobId: string }) {
  const [cases, setCases] = useState<CaseGroup[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.cases.list(jobId).then(setCases);

  useEffect(() => {
    refresh();
  }, [jobId]);

  const generate = async () => {
    setBusy(true);
    try {
      await api.cases.generate(jobId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Case groups (PAL labels)</h3>
        <button onClick={generate} disabled={busy}>
          Regenerate from patch + case rules
        </button>
      </div>
      <p className="muted">
        Groups fixtures into cases using the units-per-case rule for each fixture type.
        Re-run this after importing a new patch or editing case rules.
      </p>
      {cases.length === 0 && <p className="muted">No cases generated yet.</p>}
      {cases.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Fixture type</th>
              <th>Case label</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>{c.fixtureType}</td>
                <td>
                  <strong>{c.label}</strong>
                </td>
                <td>{c.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
