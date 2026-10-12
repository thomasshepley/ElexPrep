import { useState } from 'react';
import { api, type BankDetails } from '../api/client';
import FileInput from '../components/FileInput';
import SkillPicker from '../components/SkillPicker';
import CertificationPicker from '../components/CertificationPicker';
import BankDetailsForm from '../components/BankDetailsForm';

const DOCUMENT_SLOTS = [
  { field: 'idDocument', label: 'Photo ID' },
  { field: 'insuranceDocument', label: 'Public liability insurance' },
] as const;

type DocumentField = (typeof DOCUMENT_SLOTS)[number]['field'];

export default function ApplyPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [certifications, setCertifications] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [rightToWork, setRightToWork] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
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
      if (certifications) form.append('certifications', certifications);
      if (dayRate) form.append('dayRate', dayRate);
      if (rightToWork) form.append('rightToWork', rightToWork);
      if (gender) form.append('gender', gender);
      if (address) form.append('address', address);
      if (bankDetails) form.append('bankDetails', JSON.stringify(bankDetails));
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
            <p>Thanks, {fullName.split(' ')[0] || 'there'} - we'll be in touch once it's been reviewed.</p>
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
          <p>Apply for freelance work - we'll review your application and be in touch.</p>
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

          <div className="row" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="field" style={{ flex: '1 1 10rem' }}>
              <label htmlFor="apply-gender">Gender (optional)</label>
              <input id="apply-gender" value={gender} onChange={(e) => setGender(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 14rem' }}>
              <label htmlFor="apply-address">Address</label>
              <input id="apply-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>

          <SkillPicker value={skills} onChange={setSkills} />

          <div className="field">
            <label htmlFor="apply-rtw">Right to work</label>
            <input
              id="apply-rtw"
              value={rightToWork}
              onChange={(e) => setRightToWork(e.target.value)}
              placeholder="e.g. UK/EU citizen, has a valid visa"
            />
          </div>

          <BankDetailsForm value={bankDetails} onChange={setBankDetails} />

          <CertificationPicker value={certifications} onChange={setCertifications} />

          <div className="field">
            <label htmlFor="apply-notes">Anything else?</label>
            <textarea id="apply-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label>Documents (optional now - can be sent later)</label>
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
