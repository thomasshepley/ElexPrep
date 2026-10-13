/** Crew profile, rate card, documents and role-rate panels used on the Users & crew page. */
import { useEffect, useState } from 'react';
import { resolveCrewColor } from '@elexprep/shared';
import { api, type RoleRate, type BankDetails, type CrewMember, type CrewDocumentSummary, type CrewRateLine } from '../../api/client';
import FileInput from '../FileInput';
import CertificationPicker from '../CertificationPicker';
import BankDetailsForm from '../BankDetailsForm';
import BankDetailsReveal from '../BankDetailsReveal';
import { useToast } from '../Toast';

const DOCUMENT_SLOTS = [
  { field: 'idDocument', label: 'Photo ID' },
  { field: 'insuranceDocument', label: 'Insurance' },
] as const;

export function ProfileEditPanel({ crew, onChanged }: { crew: CrewMember; onChanged: () => void }) {
  const [color, setColor] = useState(resolveCrewColor(crew.id, crew.color));
  const [certifications, setCertifications] = useState(crew.certifications ?? '');
  const [gender, setGender] = useState(crew.gender ?? '');
  const [address, setAddress] = useState(crew.address ?? '');
  const [pronouns, setPronouns] = useState(crew.pronouns ?? '');
  const [instagramUrl, setInstagramUrl] = useState(crew.instagramUrl ?? '');
  const [facebookUrl, setFacebookUrl] = useState(crew.facebookUrl ?? '');
  const [otherLinkUrl, setOtherLinkUrl] = useState(crew.otherLinkUrl ?? '');
  const [dayRate, setDayRate] = useState(crew.dayRate ?? '');
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
        dayRate: dayRate.replace(/[£,\s]/g, ''),
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
          <div className="field" style={{ width: '9rem' }}>
            <label htmlFor={`profile-day-rate-${crew.id}`}>Agreed day rate (£)</label>
            <input
              id={`profile-day-rate-${crew.id}`}
              inputMode="decimal"
              value={dayRate}
              onChange={(e) => setDayRate(e.target.value)}
              placeholder="Role rate"
              title="What ELEX pays this person per day, unless a job sets a rate for their role. Blank uses the role rates."
            />
          </div>
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
          <BankDetailsReveal hasBankDetails={crew.hasBankDetails} fetchDetails={() => api.crew.bankDetails(crew.id)} version={crew} />
        </div>
        <BankDetailsForm value={bankDetails} onChange={setBankDetails} title="Change bank details" />
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

export function RateCardPanel({ crewId }: { crewId: string }) {
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

export function CrewDocumentsPanel({ crewId }: { crewId: string }) {
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
 * Portal-wide fallback day rate - applied on the crew margin calculator when a job
 * assignment has no rate override and the crew member has no profile default of their own.
 */
export function DefaultRatePanel() {
  const [dayRate, setDayRate] = useState('');
  const [roleRates, setRoleRates] = useState<RoleRate[]>([]);
  const [newRole, setNewRole] = useState('');
  const [newRate, setNewRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const refreshRoles = () => api.globalRoleRates.list().then(setRoleRates).catch((e) => setError(e.message));

  useEffect(() => {
    api.crew.getDefaultRate().then((r) => setDayRate(r.dayRate ?? '')).catch((e) => setError(e.message));
    refreshRoles();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.crew.setDefaultRate(dayRate || null);
      showToast('Default day rate saved');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setRoleRate = async (role: string, value: string) => {
    setError(null);
    try {
      await api.globalRoleRates.set(role, value.replace(/[£,\s]/g, ''));
      refreshRoles();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.trim() || !newRate.trim()) return;
    await setRoleRate(newRole.trim(), newRate);
    setNewRole('');
    setNewRate('');
  };

  return (
    <div className="panel">
      <h3>Day rates by role</h3>
      <p className="muted">
        What ELEX pays per day for each role, on every job. A job can set its own rate for a role on
        its Crew tab, and a person's agreed rate (their Details) beats the portal role rate. Roles
        match whatever's typed on the job, ignoring capitals and spaces.
      </p>
      {roleRates.length > 0 && (
        <div className="table-scroll">
          <table style={{ maxWidth: '32rem' }}>
            <thead>
              <tr>
                <th>Role</th>
                <th>Day rate (£)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roleRates.map((r) => (
                <tr key={r.id}>
                  <td>{r.role}</td>
                  <td>
                    <input
                      key={`${r.id}-${r.dayRate}`}
                      defaultValue={r.dayRate}
                      inputMode="decimal"
                      aria-label={`Day rate for ${r.role}`}
                      style={{ width: '6rem' }}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.dayRate && setRoleRate(r.role, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setRoleRate(r.role, '')}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={addRole} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
        <div className="field" style={{ width: '11rem' }}>
          <label htmlFor="role-rate-role">Role</label>
          <input id="role-rate-role" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. LX Tech" />
        </div>
        <div className="field" style={{ width: '7rem' }}>
          <label htmlFor="role-rate-rate">Day rate (£)</label>
          <input id="role-rate-rate" inputMode="decimal" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
        </div>
        <button type="submit" className="secondary" disabled={!newRole.trim() || !newRate.trim()}>
          Add role
        </button>
      </form>

      <h4 style={{ marginTop: '1.25rem' }}>Any other role</h4>
      <p className="muted" style={{ marginTop: 0 }}>Used when nothing above (or on the job, or for the person) sets a rate.</p>
      <form onSubmit={save} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem' }}>
        <div className="field" style={{ width: '9rem' }}>
          <label htmlFor="default-day-rate">Default day rate (£)</label>
          <input id="default-day-rate" inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="e.g. 200" />
        </div>
        <button type="submit">Save</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
