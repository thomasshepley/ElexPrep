import { useEffect, useState } from 'react';
import { api, type JobContact } from '../api/client';
import WhatsAppButton from './WhatsAppButton';
import { useToast } from './Toast';

export default function JobContactsPanel({ jobId }: { jobId: string }) {
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<JobContact[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobContacts.list(jobId).then(setContacts).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.jobContacts.create(jobId, {
        name,
        role: role || undefined,
        phone: phone || undefined,
        email: email || undefined,
        notes: notes || undefined,
      });
      setName('');
      setRole('');
      setPhone('');
      setEmail('');
      setNotes('');
      refresh();
      showToast(`Added ${name} to important contacts`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateField = async (c: JobContact, field: 'name' | 'role' | 'phone' | 'email' | 'notes', value: string) => {
    if (value === (c[field] ?? '')) return;
    await api.jobContacts.update(jobId, c.id, { [field]: value });
    refresh();
  };

  const remove = async (c: JobContact) => {
    if (!confirm(`Remove ${c.name} from important contacts?`)) return;
    await api.jobContacts.remove(jobId, c.id);
    refresh();
    showToast('Contact removed', 'info');
  };

  return (
    <div className="panel">
      <h3>Important contacts</h3>
      <p className="muted">Venue, client, or production contacts worth having on hand for this job.</p>
      <form onSubmit={create}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.9rem' }}>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="contact-name">Name</label>
            <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ width: '11rem' }}>
            <label htmlFor="contact-role">Role</label>
            <input id="contact-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Venue Manager" />
          </div>
          <div className="field" style={{ width: '10rem' }}>
            <label htmlFor="contact-phone">Phone</label>
            <input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
          </div>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="contact-email">Email</label>
            <input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ width: '14rem' }}>
            <label htmlFor="contact-notes">Notes</label>
            <input id="contact-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Site access code, etc." />
          </div>
          <button type="submit">Add</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}

      {contacts.length > 0 ? (
        <table style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Notes</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>
                  <input defaultValue={c.name} style={{ width: '10rem' }} onBlur={(e) => updateField(c, 'name', e.target.value)} />
                </td>
                <td>
                  <input defaultValue={c.role ?? ''} style={{ width: '9rem' }} onBlur={(e) => updateField(c, 'role', e.target.value)} />
                </td>
                <td>
                  <input defaultValue={c.phone ?? ''} style={{ width: '8rem' }} onBlur={(e) => updateField(c, 'phone', e.target.value)} />
                </td>
                <td>
                  <input defaultValue={c.email ?? ''} style={{ width: '10rem' }} onBlur={(e) => updateField(c, 'email', e.target.value)} />
                </td>
                <td>
                  <input defaultValue={c.notes ?? ''} style={{ width: '11rem' }} onBlur={(e) => updateField(c, 'notes', e.target.value)} />
                </td>
                <td>
                  <WhatsAppButton phone={c.phone} label="WhatsApp" />
                </td>
                <td>
                  <button type="button" className="secondary" onClick={() => remove(c)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No contacts added yet.</p>
      )}
    </div>
  );
}
