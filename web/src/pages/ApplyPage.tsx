import { useState } from 'react';
import { api } from '../api/client';
import FileInput from '../components/FileInput';

const DOCUMENT_SLOTS = [
  { field: 'idDocument', label: 'Photo ID' },
  { field: 'rightToWorkDocument', label: 'Right to work evidence' },
  { field: 'insuranceDocument', label: 'Public liability insurance' },
  { field: 'bankDetailsDocument', label: 'Bank details' },
] as const;

type DocumentField = (typeof DOCUMENT_SLOTS)[number]['field'];

export default function ApplyPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [rightToWork, setRightToWork] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<Partial<Record<DocumentField, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('fullName', fullName);
      form.append('email', email);
      if (phone) form.append('phone', phone);
      if (skills) form.append('skills', skills);
      if (dayRate) form.append('dayRate', dayRate);
      if (rightToWork) form.append('rightToWork', rightToWork);
      if (notes) form.append('notes', notes);
      for (const { field } of DOCUMENT_SLOTS) {
        const file = files[field];
        if (file) form.append(field, file);
      }
      await api.crewApplications.submit(form);
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-mark" />
            <h1>Application received</h1>
            <p>Thanks, {fullName.split(' ')[0] || 'there'} — we'll be in touch once it's been reviewed.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <h1>Join the ELEX crew</h1>
          <p>Apply for freelance work — we'll review your application and be in touch.</p>
        </div>
        <form onSubmit={submit}>
          <div className="row" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="field" style={{ flex: '1 1 14rem' }}>
              <label htmlFor="apply-name">Full name</label>
              <input id="apply-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: '1 1 14rem' }}>
              <label htmlFor="apply-email">Email</label>
              <input id="apply-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="apply-phone">Phone</label>
              <input id="apply-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="apply-day-rate">Day rate</label>
              <input id="apply-day-rate" value={dayRate} onChange={(e) => setDayRate(e.target.value)} placeholder="250" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="apply-skills">Skills / roles</label>
            <input id="apply-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="LD, Rigger, Spot Op" />
          </div>

          <div className="field">
            <label htmlFor="apply-rtw">Right to work</label>
            <input
              id="apply-rtw"
              value={rightToWork}
              onChange={(e) => setRightToWork(e.target.value)}
              placeholder="e.g. UK/EU citizen, has a valid visa"
            />
          </div>

          <div className="field">
            <label htmlFor="apply-notes">Anything else?</label>
            <textarea id="apply-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label>Documents (optional now — can be sent later)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {DOCUMENT_SLOTS.map(({ field, label }) => (
                <div key={field} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {label}
                  </span>
                  <FileInput
                    accept="application/pdf,image/*"
                    label={files[field] ? 'Change file' : 'Upload'}
                    onFile={(file) => setFiles((f) => ({ ...f, [field]: file }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            Submit application
          </button>
        </form>
      </div>
    </div>
  );
}
