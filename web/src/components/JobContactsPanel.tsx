import { SkeletonList, SkeletonRegion } from './Skeleton';
import { useEffect, useState } from 'react';
import { api, type JobContact } from '../api/client';
import WhatsAppButton from './WhatsAppButton';
import { useToast } from './Toast';
import { useDialog } from './Dialog';
import { PlusIcon } from './Icons';

export default function JobContactsPanel({ jobId }: { jobId: string }) {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [contactsLoaded, setContacts] = useState<JobContact[] | null>(null);
  const contacts = contactsLoaded ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobContacts.list(jobId).then(setContacts).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const create = async (d: ContactDraft) => {
    setError(null);
    await api.jobContacts.create(jobId, {
      name: d.name,
      role: d.role || undefined,
      phone: d.phone || undefined,
      email: d.email || undefined,
      notes: d.notes || undefined,
    });
    refresh();
    showToast(`Added ${d.name} to important contacts`);
  };

  const save = async (c: JobContact, draft: ContactDraft) => {
    const changes = Object.fromEntries(
      (Object.keys(draft) as (keyof ContactDraft)[]).filter((k) => draft[k] !== (c[k] ?? '')).map((k) => [k, draft[k]]),
    );
    if (Object.keys(changes).length > 0) await api.jobContacts.update(jobId, c.id, changes);
    setEditingId(null);
    refresh();
  };

  const remove = async (c: JobContact) => {
    if (!(await dialog.confirm({ title: `Remove ${c.name}?`, message: 'They come off this job\'s important contacts.', confirmLabel: 'Remove', danger: true }))) return;
    await api.jobContacts.remove(jobId, c.id);
    refresh();
    showToast('Contact removed', 'info');
  };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>Important contacts</h3>
        {!adding && (
          <button type="button" className="secondary" onClick={() => setAdding(true)}>
            <PlusIcon /> Add contact
          </button>
        )}
      </div>
      <p className="muted">Venue, client, or production contacts worth having on hand for this job.</p>

      {contacts.length > 0 ? (
        <div className="contact-cards">
          {contacts.map((c) =>
            editingId === c.id ? (
              <ContactForm key={c.id} initial={c} submitLabel="Save" onSubmit={(d) => save(c, d)} onCancel={() => setEditingId(null)} />
            ) : (
              <div key={c.id} className="contact-card">
                <div className="contact-card-head">
                  <div style={{ minWidth: 0 }}>
                    <strong>{c.name}</strong>
                    {c.role && <div className="muted">{c.role}</div>}
                  </div>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    <button type="button" className="secondary" onClick={() => setEditingId(c.id)} aria-label={`Edit ${c.name}`}>
                      Edit
                    </button>
                    <button type="button" className="secondary" onClick={() => remove(c)} aria-label={`Remove ${c.name}`}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="contact-card-links">
                  {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, '')}`}>{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                  {c.phone && <WhatsAppButton phone={c.phone} label="WhatsApp" compact />}
                </div>
                {c.notes && <p className="contact-card-notes">{c.notes}</p>}
              </div>
            ),
          )}
        </div>
      ) : contactsLoaded === null && !error ? (
        <SkeletonRegion>
          <SkeletonList items={2} />
        </SkeletonRegion>
      ) : (
        !adding && <p className="muted">No contacts added yet.</p>
      )}

      {adding && (
        <ContactForm
          submitLabel="Add contact"
          onSubmit={async (d) => {
            await create(d);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

type ContactDraft = { name: string; role: string; phone: string; email: string; notes: string };

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: JobContact;
  submitLabel: string;
  onSubmit: (draft: ContactDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ContactDraft>({
    name: initial?.name ?? '',
    role: initial?.role ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    notes: initial?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = initial?.id ?? 'new';
  const set = (k: keyof ContactDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <form
      className="contact-card contact-card-editing"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(draft);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`contact-name-${id}`}>Name</label>
          <input id={`contact-name-${id}`} value={draft.name} onChange={set('name')} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor={`contact-role-${id}`}>Role</label>
          <input id={`contact-role-${id}`} value={draft.role} onChange={set('role')} placeholder="Venue Manager" />
        </div>
        <div className="field">
          <label htmlFor={`contact-phone-${id}`}>Phone</label>
          <input id={`contact-phone-${id}`} type="tel" value={draft.phone} onChange={set('phone')} placeholder="07700 900000" />
        </div>
        <div className="field">
          <label htmlFor={`contact-email-${id}`}>Email</label>
          <input id={`contact-email-${id}`} type="email" value={draft.email} onChange={set('email')} />
        </div>
        <div className="field form-grid-full">
          <label htmlFor={`contact-notes-${id}`}>Notes</label>
          <input id={`contact-notes-${id}`} value={draft.notes} onChange={set('notes')} placeholder="Site access code, etc." />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ gap: '0.5rem' }}>
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
