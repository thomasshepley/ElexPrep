import { useEffect, useState } from 'react';
import { api, type AdHocLabel, type CrewLabelRequest } from '../api/client';
import LabelTypeForm, { TYPE_LABELS, type AdHocType } from './LabelTypeForm';
import { WhoIcon } from './Icons';
import { useDialog } from './Dialog';
import InlineEdit from './InlineEdit';
import LocationSelect, { useJobLocations } from './LocationSelect';

/**
 * One-off/ad hoc labels for a job, grouped into the same 3 sections crew think in when they
 * print label sheets: PAL cases, cable runs, and the truss/spike + rack labels that share the
 * same physical die-cut stock as fixture labels. A "Requested labels" review queue sits above
 * them for anything a crew member has asked for via the Why section's label creator.
 */
export default function LabelsPanel({ jobId, groupId = null }: { jobId: string; groupId?: string | null }) {
  const [items, setItems] = useState<AdHocLabel[]>([]);

  const refresh = () => api.adHocLabels.list(jobId).then(setItems);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const stageItems = items.filter((i) => (i.groupId ?? null) === groupId);

  return (
    <div>
      <RequestedLabelsPanel jobId={jobId} onChanged={refresh} />
      <LabelSection
        jobId={jobId}
        groupId={groupId}
        title="PAL"
        description="Generic PAL case labels - personal Peli cases, one-off equipment cases."
        types={['PAL']}
        items={stageItems}
        onChanged={refresh}
      />
      <LabelSection
        jobId={jobId}
        groupId={groupId}
        title="Cables"
        description="Cable and circuit run labels, including narrow DMX labels with a fold/cut line."
        types={['CABLE']}
        items={stageItems}
        onChanged={refresh}
      />
      <LabelSection
        jobId={jobId}
        groupId={groupId}
        title="Truss Spikes and Fixture Labels"
        description="Truss/spike position, tip warning and sACN node labels, plus rack labels - all print on the same die-cut sheet stock as fixture labels."
        types={['TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'RACK']}
        items={stageItems}
        onChanged={refresh}
      />
    </div>
  );
}

function summarizeContent(labelType: string, content: Record<string, unknown>): string {
  switch (labelType) {
    case 'TRUSS_SPIKE_POSITION':
      return `#${content.address ?? ''} - ${content.location ?? ''}`;
    case 'TRUSS_SPIKE_TIP':
      return String(content.text ?? 'DO NOT TIP');
    case 'TRUSS_SPIKE_SACN':
      return String(content.ipAddress ?? '');
    case 'CABLE':
      return `${content.text ?? ''}${content.isDmx ? ' (DMX)' : ''}`;
    case 'PAL':
      return `${content.location ?? ''} - ${content.title ?? ''} ${content.subtitle ?? ''}`;
    case 'RACK':
      return `${content.title ?? ''} ${content.subtitle ?? ''}`;
    default:
      return JSON.stringify(content);
  }
}

function RequestedLabelsPanel({ jobId, onChanged }: { jobId: string; onChanged: () => void }) {
  const dialog = useDialog();
  const [requests, setRequests] = useState<CrewLabelRequest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.labelRequests.list(jobId, 'PENDING').then(setRequests).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const approve = async (id: string) => {
    await api.labelRequests.approve(jobId, id);
    refresh();
    onChanged();
  };

  const reject = async (id: string) => {
    const note = await dialog.prompt({ title: 'Deny this label request?', label: 'Reason (optional)', multiline: true, confirmLabel: 'Deny request' });
    if (note === null) return;
    await api.labelRequests.reject(jobId, id, note.trim() || undefined);
    refresh();
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === requests.length ? new Set() : new Set(requests.map((r) => r.id))));
  };

  const bulkApprove = async () => {
    await Promise.all([...selected].map((id) => api.labelRequests.approve(jobId, id)));
    setSelected(new Set());
    refresh();
    onChanged();
  };

  const bulkReject = async () => {
    const note = await dialog.prompt({ title: `Deny ${selected.size} label requests?`, label: 'Reason (optional)', multiline: true, confirmLabel: 'Deny requests' });
    if (note === null) return;
    await Promise.all([...selected].map((id) => api.labelRequests.reject(jobId, id, note.trim() || undefined)));
    setSelected(new Set());
    refresh();
  };

  if (requests.length === 0) return null;

  return (
    <div className="panel">
      <h3>Requested labels</h3>
      <p className="muted">Labels crew members have asked for from the job's Why section - review before they print.</p>
      {error && <p className="error">{error}</p>}
      {selected.size > 0 && (
        <div className="row" style={{ marginBottom: '0.5rem', gap: '0.5rem' }}>
          <span className="muted">{selected.size} selected</span>
          <button onClick={bulkApprove}>Approve selected</button>
          <button className="secondary" onClick={bulkReject}>
            Deny selected
          </button>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all requests"
                  checked={selected.size === requests.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>From</th>
              <th>Type</th>
              <th>Content</th>
              <th>Qty</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select request from ${r.requestedByDisplayName}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelected(r.id)}
                  />
                </td>
                <td>
                  <span className="row" style={{ gap: '0.3rem' }}>
                    <WhoIcon />
                    {r.requestedByDisplayName}
                  </span>
                </td>
                <td>{TYPE_LABELS[r.labelType as AdHocType] ?? r.labelType}</td>
                <td>{summarizeContent(r.labelType, r.content)}</td>
                <td>{r.quantity}</td>
                <td>
                  <div className="row">
                    <button onClick={() => approve(r.id)}>Approve</button>
                    <button className="secondary" onClick={() => reject(r.id)}>
                      Deny
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LabelSection({
  jobId,
  groupId,
  title,
  description,
  types,
  items,
  onChanged,
}: {
  jobId: string;
  groupId: string | null;
  title: string;
  description: string;
  types: AdHocType[];
  items: AdHocLabel[];
  onChanged: () => void;
}) {
  const sectionItems = items.filter((i) => types.includes(i.labelType as AdHocType));
  const locationOptions = useJobLocations(jobId, items.map((i) => (typeof i.content.location === 'string' ? i.content.location : null)));

  const create = async (labelType: AdHocType, content: Record<string, unknown>, quantity: number) => {
    await api.adHocLabels.create(jobId, { labelType, content, quantity, groupId });
    onChanged();
  };

  const remove = async (id: string) => {
    await api.adHocLabels.remove(jobId, id);
    onChanged();
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error('Quantity must be at least 1');
    await api.adHocLabels.update(jobId, id, { quantity });
    onChanged();
  };

  const updateContentField = async (item: AdHocLabel, key: string, rawValue: string | boolean) => {
    const value = key === 'address' ? Number(rawValue) : rawValue;
    const content = { ...item.content, [key]: value };
    await api.adHocLabels.update(jobId, item.id, { content });
    onChanged();
  };

  const editableField = (item: AdHocLabel, key: string, placeholder: string, width: number, type: 'text' | 'number' = 'text') =>
    key === 'location' ? (
      <LocationSelect
        ariaLabel={placeholder}
        placeholder="Location…"
        value={item.content.location == null ? '' : String(item.content.location)}
        options={locationOptions}
        onChange={(v) => updateContentField(item, 'location', v)}
      />
    ) : (
    <InlineEdit
      type={type}
      label={placeholder}
      value={item.content[key] == null ? '' : String(item.content[key])}
      width={width}
      onSave={(v) => updateContentField(item, key, v)}
    />
  );

  const renderEditableContent = (item: AdHocLabel) => {
    switch (item.labelType) {
      case 'TRUSS_SPIKE_POSITION':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'address', 'Position number', 90, 'number')}
            {editableField(item, 'location', 'Location', 110)}
          </div>
        );
      case 'TRUSS_SPIKE_TIP':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'text', 'Text (default: DO NOT TIP)', 180)}
            {editableField(item, 'location', 'Location', 110)}
          </div>
        );
      case 'TRUSS_SPIKE_SACN':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'ipAddress', 'IP address', 130)}
            {editableField(item, 'subnetMask', 'Subnet mask', 130)}
            {editableField(item, 'location', 'Location', 110)}
          </div>
        );
      case 'CABLE':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'text', 'Cable/circuit text', 160)}
            {editableField(item, 'location', 'Location', 110)}
            <label className="row" style={{ gap: '0.3rem' }}>
              <input
                type="checkbox"
                defaultChecked={Boolean(item.content.isDmx)}
                onChange={(e) => updateContentField(item, 'isDmx', e.target.checked)}
              />
              DMX
            </label>
          </div>
        );
      case 'PAL':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'location', 'Location', 110)}
            {editableField(item, 'title', 'Title', 150)}
            {editableField(item, 'subtitle', 'Subtitle', 110)}
          </div>
        );
      case 'RACK':
        return (
          <div className="row" style={{ gap: '0.4rem' }}>
            {editableField(item, 'title', 'Title', 150)}
            {editableField(item, 'subtitle', 'Subtitle', 150)}
            {editableField(item, 'location', 'Location', 110)}
          </div>
        );
      default:
        return JSON.stringify(item.content);
    }
  };

  return (
    <div className="panel">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <LabelTypeForm types={types} onSubmit={create} locations={locationOptions} />

      {sectionItems.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: '1rem' }}>
            Click any value to edit it - Enter or clicking away saves, Escape cancels.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Content</th>
                  <th>Qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sectionItems.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {TYPE_LABELS[i.labelType as AdHocType] ?? i.labelType}
                      {i.requestedByDisplayName && (
                        <div className="chip chip-neutral" style={{ marginTop: '0.3rem', gap: '0.3rem' }}>
                          <WhoIcon /> {i.requestedByDisplayName}
                        </div>
                      )}
                    </td>
                    <td>{renderEditableContent(i)}</td>
                    <td>
                      <InlineEdit type="number" min={1} label="Quantity" value={i.quantity} width={40} onSave={(v) => updateQuantity(i.id, Number(v))} />
                    </td>
                    <td>
                      <button className="secondary" onClick={() => remove(i.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sectionItems.length === 0 && <p className="muted">No labels yet in this section.</p>}
    </div>
  );
}
