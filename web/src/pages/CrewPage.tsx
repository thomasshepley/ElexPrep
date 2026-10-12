import { Fragment, useEffect, useState } from 'react';
import { resolveCrewColor } from '@elexprep/shared';
import { api, type BankDetails, type CrewMember, type CrewDocumentSummary, type CrewRateLine } from '../api/client';
import FileInput from '../components/FileInput';
import SkillPicker from '../components/SkillPicker';
import CertificationPicker from '../components/CertificationPicker';
import BankDetailsForm from '../components/BankDetailsForm';
import BankDetailsReveal from '../components/BankDetailsReveal';
import WhatsAppButton from '../components/WhatsAppButton';
import PasswordInput from '../components/PasswordInput';

const DOCUMENT_SLOTS = [
  { field: 'idDocument', label: 'Photo ID' },
  { field: 'insuranceDocument', label: 'Insurance' },
] as const;

export default function CrewPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => api.crew.list().then(setCrew).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await api.crew.create({
        username,
        password,
        displayName: displayName || undefined,
        phone: phone || undefined,
        skills: skills || undefined,
      });
      setUsername('');
      setDisplayName('');
      setPassword('');
      setConfirmPassword('');
      setPhone('');
      setSkills('');
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
    const confirmMessage =
      c.userRole === 'ADMIN'
        ? `Remove ${c.displayName} from the crew roster? Their admin login is unaffected.`
        : `Delete crew member ${c.displayName}? This removes their login and any job assignments.`;
    if (!confirm(confirmMessage)) return;
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
              <PasswordInput
                id="crew-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="field" style={{ width: '12rem' }}>
              <label htmlFor="crew-confirm-password">Confirm password</label>
              <PasswordInput
                id="crew-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ width: '10rem' }}>
              <label htmlFor="crew-phone">Phone</label>
              <input id="crew-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
          </div>
          <SkillPicker value={skills} onChange={setSkills} />
          <p className="muted" style={{ marginTop: '0.4rem' }}>
            Set a rate card after adding them — expand their row with "Details".
          </p>
          <button type="submit">Add crew member</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <AddAdminAsCrewPanel onAdded={refresh} />

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Skills</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {crew.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    <span
                      className="crew-swatch-dot"
                      style={{ background: resolveCrewColor(c.id, c.color) }}
                      title="Schedule swatch color"
                    />
                    <div style={{ fontWeight: 600 }}>{c.displayName}</div>
                    {c.userRole === 'ADMIN' && <span className="chip chip-role">Staff</span>}
                  </div>
                  <span className="muted">{c.username}</span>
                </td>
                <td>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    {c.phone ?? '—'}
                    <WhatsAppButton phone={c.phone} label="WhatsApp" />
                  </div>
                </td>
                <td>{c.skills ?? '—'}</td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={c.active} onChange={() => toggleActive(c)} />
                    <span className="switch-track" />
                    {c.active ? 'Active' : 'Inactive'}
                  </label>
                </td>
                <td className="row">
                  <button className="secondary" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    Details
                  </button>
                  {c.userRole !== 'ADMIN' && (
                    <button className="secondary" onClick={() => resetPassword(c)}>
                      Reset password
                    </button>
                  )}
                  <button className="secondary" onClick={() => remove(c)}>
                    {c.userRole === 'ADMIN' ? 'Remove from crew' : 'Delete'}
                  </button>
                </td>
              </tr>
              {expandedId === c.id && (
                <tr>
                  <td colSpan={5}>
                    <ProfileEditPanel crew={c} onChanged={refresh} />
                    <RateCardPanel crewId={c.id} />
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

function ProfileEditPanel({ crew, onChanged }: { crew: CrewMember; onChanged: () => void }) {
  const [color, setColor] = useState(resolveCrewColor(crew.id, crew.color));
  const [certifications, setCertifications] = useState(crew.certifications ?? '');
  const [gender, setGender] = useState(crew.gender ?? '');
  const [address, setAddress] = useState(crew.address ?? '');
  const [pronouns, setPronouns] = useState(crew.pronouns ?? '');
  const [instagramUrl, setInstagramUrl] = useState(crew.instagramUrl ?? '');
  const [facebookUrl, setFacebookUrl] = useState(crew.facebookUrl ?? '');
  const [otherLinkUrl, setOtherLinkUrl] = useState(crew.otherLinkUrl ?? '');
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await api.crew.update(crew.id, {
        color,
        certifications,
        gender,
        address,
        pronouns,
        instagramUrl,
        facebookUrl,
        otherLinkUrl,
        bankDetails: bankDetails ?? undefined,
      });
      setBankDetails(null);
      setSaved(true);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
      <strong>Profile</strong>
      {error && <p className="error">{error}</p>}
      <form onSubmit={save}>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field" style={{ width: '6rem' }}>
            <label htmlFor={`profile-color-${crew.id}`}>Schedule swatch</label>
            <input
              id={`profile-color-${crew.id}`}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '100%', height: '2.2rem', padding: '0.15rem' }}
            />
          </div>
          <div className="field" style={{ width: '10rem' }}>
            <label htmlFor={`profile-pronouns-${crew.id}`}>Pronouns</label>
            <input id={`profile-pronouns-${crew.id}`} value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="they/them" />
          </div>
          <div className="field" style={{ width: '10rem' }}>
            <label htmlFor={`profile-gender-${crew.id}`}>Gender</label>
            <input id={`profile-gender-${crew.id}`} value={gender} onChange={(e) => setGender(e.target.value)} />
          </div>
          <div className="field" style={{ width: '16rem' }}>
            <label htmlFor={`profile-address-${crew.id}`}>Address</label>
            <input id={`profile-address-${crew.id}`} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field" style={{ width: '14rem' }}>
            <label htmlFor={`profile-instagram-${crew.id}`}>Instagram</label>
            <input id={`profile-instagram-${crew.id}`} value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} />
          </div>
          <div className="field" style={{ width: '14rem' }}>
            <label htmlFor={`profile-facebook-${crew.id}`}>Facebook</label>
            <input id={`profile-facebook-${crew.id}`} value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} />
          </div>
          <div className="field" style={{ width: '14rem' }}>
            <label htmlFor={`profile-other-link-${crew.id}`}>Other link</label>
            <input id={`profile-other-link-${crew.id}`} value={otherLinkUrl} onChange={(e) => setOtherLinkUrl(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Bank details</label>
          <BankDetailsReveal hasBankDetails={crew.hasBankDetails} fetchDetails={() => api.crew.bankDetails(crew.id)} />
        </div>
        <BankDetailsForm value={bankDetails} onChange={setBankDetails} />
        <p className="muted" style={{ marginTop: '-0.5rem' }}>
          Leave blank to keep what's already on file.
        </p>

        <CertificationPicker value={certifications} onChange={setCertifications} />

        <button type="submit" style={{ marginTop: '0.5rem' }}>
          Save profile
        </button>
        {saved && <span className="muted" style={{ marginLeft: '0.6rem' }}>Saved ✓</span>}
      </form>
    </div>
  );
}

function RateCardPanel({ crewId }: { crewId: string }) {
  const [lines, setLines] = useState<CrewRateLine[]>([]);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.crew.rateLines.list(crewId).then(setLines).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.crew.rateLines.create(crewId, { label, amount });
      setLabel('');
      setAmount('');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (lineId: string) => {
    await api.crew.rateLines.remove(crewId, lineId);
    refresh();
  };

  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
      <strong>Rate card</strong>
      {error && <p className="error">{error}</p>}
      {lines.length === 0 ? (
        <p className="muted">No rate lines yet.</p>
      ) : (
        <ul style={{ margin: '0.5rem 0' }}>
          {lines.map((l) => (
            <li key={l.id}>
              <strong>{l.label}:</strong> {l.amount}{' '}
              <button className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={() => remove(l.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
        <div className="field" style={{ width: '12rem' }}>
          <label htmlFor={`rate-label-${crewId}`}>Label</label>
          <input id={`rate-label-${crewId}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Day rate, Overtime" required />
        </div>
        <div className="field" style={{ width: '8rem' }}>
          <label htmlFor={`rate-amount-${crewId}`}>Amount</label>
          <input id={`rate-amount-${crewId}`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" required />
        </div>
        <button type="submit">Add rate line</button>
      </form>
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

/**
 * Lets an ADMIN who also works shifts show up as assignable crew without a second login —
 * picks from admin accounts that don't already have a crew profile (see
 * api.crew.adminCandidates), then calls api.crew.fromAdmin to attach a bare CrewProfile to
 * their existing User row.
 */
function AddAdminAsCrewPanel({ onAdded }: { onAdded: () => void }) {
  const [candidates, setCandidates] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.crew.adminCandidates().then(setCandidates).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  if (candidates.length === 0) return null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.crew.fromAdmin(selected);
      setSelected('');
      refresh();
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Add an admin as crew</h3>
      <p className="muted">
        For staff who also work shifts — this makes their existing login assignable to jobs
        without creating a second account.
      </p>
      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem' }}>
        <div className="field" style={{ width: '14rem' }}>
          <label htmlFor="admin-as-crew-select">Admin account</label>
          <select id="admin-as-crew-select" value={selected} onChange={(e) => setSelected(e.target.value)} required>
            <option value="" disabled>
              Choose an admin…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName} ({c.username})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy || !selected}>
          Add as crew
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
