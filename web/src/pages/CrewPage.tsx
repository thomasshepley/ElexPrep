import { Fragment, useEffect, useState } from 'react';
import { api, type CrewMember, type CrewDocumentSummary } from '../api/client';
import FileInput from '../components/FileInput';

const DOCUMENT_SLOTS = [
  { field: 'idDocument', label: 'Photo ID' },
  { field: 'rightToWorkDocument', label: 'Right to work' },
  { field: 'insuranceDocument', label: 'Insurance' },
  { field: 'bankDetailsDocument', label: 'Bank details' },
] as const;

export default function CrewPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => api.crew.list().then(setCrew).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.crew.create({
        username,
        password,
        displayName: displayName || undefined,
        phone: phone || undefined,
        skills: skills || undefined,
        dayRate: dayRate || undefined,
      });
      setUsername('');
      setDisplayName('');
      setPassword('');
      setPhone('');
      setSkills('');
      setDayRate('');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleActive = async (c: CrewMember) => {
    await api.crew.update(c.id, { active: !c.active });
    refresh();
  };

  const resetPassword = async (c: CrewMember) => {
    const pw = prompt(`New password for ${c.username}:`);
    if (!pw) return;
    await api.crew.update(c.id, { password: pw });
    alert('Password updated');
  };

  const remove = async (c: CrewMember) => {
    if (!confirm(`Delete crew member ${c.displayName}? This removes their login and any job assignments.`)) return;
    setError(null);
    try {
      await api.crew.remove(c.id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1>Crew</h1>
      <p className="muted">
        Freelance crew accounts. Each one gets a login on the crew portal once it's ready; for
        now this manages their profile and lets you attribute them to jobs from the job's Crew
        tab. Inactive crew stay in the roster (so past job history isn't lost) but can't be
        added to new jobs.
      </p>
      <div className="panel">
        <h3>Add crew member</h3>
        <form onSubmit={create}>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="crew-username">Username</label>
              <input id="crew-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jsmith" required />
            </div>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="crew-display-name">Display name</label>
              <input id="crew-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jamie Smith" />
            </div>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="crew-password">Password</label>
              <input
                id="crew-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field" style={{ width: '10rem' }}>
              <label htmlFor="crew-phone">Phone</label>
              <input id="crew-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="crew-skills">Skills</label>
              <input id="crew-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="LD, Rigger" />
            </div>
            <div className="field" style={{ width: '9rem' }}>
              <label htmlFor="crew-day-rate">Day rate</label>
              <input id="crew-day-rate" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="250" />
            </div>
            <button type="submit">Add crew member</button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Skills</th>
            <th>Day rate</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {crew.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.displayName}</div>
                  <span className="muted">{c.username}</span>
                </td>
                <td>{c.phone ?? '—'}</td>
                <td>{c.skills ?? '—'}</td>
                <td>{c.dayRate ?? '—'}</td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={c.active} onChange={() => toggleActive(c)} />
                    <span className="switch-track" />
                    {c.active ? 'Active' : 'Inactive'}
                  </label>
                </td>
                <td className="row">
                  <button className="secondary" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    Documents
                  </button>
                  <button className="secondary" onClick={() => resetPassword(c)}>
                    Reset password
                  </button>
                  <button className="secondary" onClick={() => remove(c)}>
                    Delete
                  </button>
                </td>
              </tr>
              {expandedId === c.id && (
                <tr>
                  <td colSpan={6}>
                    <CrewDocumentsPanel crewId={c.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrewDocumentsPanel({ crewId }: { crewId: string }) {
  const [documents, setDocuments] = useState<CrewDocumentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.crew.documents.list(crewId).then(setDocuments).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  const upload = async (field: string, file: File) => {
    setError(null);
    try {
      const form = new FormData();
      form.append(field, file);
      setDocuments(await api.crew.documents.upload(crewId, form));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (docId: string) => {
    await api.crew.documents.remove(crewId, docId);
    refresh();
  };

  return (
    <div style={{ padding: '0.75rem 0' }}>
      <strong>Compliance documents</strong>
      {error && <p className="error">{error}</p>}
      {documents.length === 0 ? (
        <p className="muted">No documents on file.</p>
      ) : (
        <ul style={{ margin: '0.5rem 0' }}>
          {documents.map((d) => (
            <li key={d.id}>
              <a href={api.crew.documents.url(crewId, d.id)} target="_blank" rel="noreferrer">
                {d.originalName}
              </a>{' '}
              <span className="muted">({d.kind.replace(/_/g, ' ').toLowerCase()})</span>{' '}
              <button className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={() => remove(d.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
        {DOCUMENT_SLOTS.map(({ field, label }) => (
          <div key={field} className="row">
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {label}
            </span>
            <FileInput accept="application/pdf,image/*" label="Upload" onFile={(file) => upload(field, file)} />
          </div>
        ))}
      </div>
    </div>
  );
}
