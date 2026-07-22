import { useEffect, useState } from 'react';
import { api, type AdHocLabel } from '../api/client';

type AdHocType = 'TRUSS_SPIKE_POSITION' | 'TRUSS_SPIKE_TIP' | 'TRUSS_SPIKE_SACN' | 'CABLE' | 'PAL' | 'RACK';

const TYPE_LABELS: Record<AdHocType, string> = {
  TRUSS_SPIKE_POSITION: 'Truss/Spike — position number',
  TRUSS_SPIKE_TIP: 'Truss/Spike — DO NOT TIP',
  TRUSS_SPIKE_SACN: 'Truss/Spike — sACN node (IP)',
  CABLE: 'Cable label',
  PAL: 'PAL case label (generic, e.g. personal Peli case)',
  RACK: 'Rack label',
};

/**
 * One-off/ad hoc labels for a job, grouped into the same 3 sections crew think in when they
 * print label sheets: PAL cases, cable runs, and the truss/spike + rack labels that share the
 * same physical die-cut stock as fixture labels.
 */
export default function LabelsPanel({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<AdHocLabel[]>([]);

  const refresh = () => api.adHocLabels.list(jobId).then(setItems);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <div>
      <LabelSection
        jobId={jobId}
        title="PAL"
        description="Generic PAL case labels — personal Peli cases, one-off equipment cases."
        types={['PAL']}
        items={items}
        onChanged={refresh}
      />
      <LabelSection
        jobId={jobId}
        title="Cables"
        description="Cable and circuit run labels, including narrow DMX labels with a fold/cut line."
        types={['CABLE']}
        items={items}
        onChanged={refresh}
      />
      <LabelSection
        jobId={jobId}
        title="Truss Spikes and Fixture Labels"
        description="Truss/spike position, tip warning and sACN node labels, plus rack labels — all print on the same die-cut sheet stock as fixture labels."
        types={['TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'RACK']}
        items={items}
        onChanged={refresh}
      />
    </div>
  );
}

function LabelSection({
  jobId,
  title,
  description,
  types,
  items,
  onChanged,
}: {
  jobId: string;
  title: string;
  description: string;
  types: AdHocType[];
  items: AdHocLabel[];
  onChanged: () => void;
}) {
  const [labelType, setLabelType] = useState<AdHocType>(types[0]);
  const [quantity, setQuantity] = useState(1);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isDmx, setIsDmx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionItems = items.filter((i) => types.includes(i.labelType as AdHocType));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let content: Record<string, unknown> = {};
    if (labelType === 'TRUSS_SPIKE_POSITION') content = { address: Number(fields.address), location: fields.location };
    if (labelType === 'TRUSS_SPIKE_TIP') content = { text: fields.text || 'DO NOT TIP', location: fields.location };
    if (labelType === 'TRUSS_SPIKE_SACN')
      content = { ipAddress: fields.ipAddress, subnetMask: fields.subnetMask || '255.0.0.0', location: fields.location };
    if (labelType === 'CABLE') content = { text: fields.text, isDmx, location: fields.location };
    if (labelType === 'PAL') content = { location: fields.location, title: fields.title, subtitle: fields.subtitle };
    if (labelType === 'RACK') content = { title: fields.title, subtitle: fields.subtitle, location: fields.location };

    try {
      await api.adHocLabels.create(jobId, { labelType, content, quantity });
      setFields({});
      setQuantity(1);
      setIsDmx(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.adHocLabels.remove(jobId, id);
    onChanged();
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    await api.adHocLabels.update(jobId, id, { quantity });
    onChanged();
  };

  const updateContentField = async (item: AdHocLabel, key: string, rawValue: string | boolean) => {
    const value = key === 'address' ? Number(rawValue) : rawValue;
    const content = { ...item.content, [key]: value };
    await api.adHocLabels.update(jobId, item.id, { content });
    onChanged();
  };

  const field = (key: string, placeholder: string) => (
    <input
      placeholder={placeholder}
      value={fields[key] ?? ''}
      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
    />
  );

  const editableField = (item: AdHocLabel, key: string, placeholder: string, width: number, type: 'text' | 'number' = 'text') => (
    <input
      type={type}
      placeholder={placeholder}
      defaultValue={String(item.content[key] ?? '')}
      style={{ width }}
      onBlur={(e) => updateContentField(item, key, e.target.value)}
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
      <form className="row" onSubmit={submit}>
        {types.length > 1 && (
          <select value={labelType} onChange={(e) => setLabelType(e.target.value as AdHocType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        )}

        {labelType === 'TRUSS_SPIKE_POSITION' && (
          <>
            {field('address', 'Position number')}
            {field('location', 'Location (e.g. FOH, Floor)')}
          </>
        )}
        {labelType === 'TRUSS_SPIKE_TIP' && (
          <>
            {field('text', 'Text (default: DO NOT TIP)')}
            {field('location', 'Location (e.g. FOH, Floor)')}
          </>
        )}
        {labelType === 'TRUSS_SPIKE_SACN' && (
          <>
            {field('ipAddress', 'IP address')}
            {field('subnetMask', 'Subnet mask (default 255.0.0.0)')}
            {field('location', 'Location (e.g. FOH, Floor)')}
          </>
        )}
        {labelType === 'CABLE' && (
          <>
            {field('text', 'Cable/circuit text')}
            {field('location', 'Location (e.g. FOH, Floor)')}
            <label className="row" style={{ gap: '0.3rem' }}>
              <input type="checkbox" checked={isDmx} onChange={(e) => setIsDmx(e.target.checked)} />
              DMX (narrow + cut line)
            </label>
          </>
        )}
        {labelType === 'PAL' && (
          <>
            {field('location', 'Location (e.g. FOH, Floor)')}
            {field('title', 'Title (e.g. equipment name)')}
            {field('subtitle', 'Subtitle (optional)')}
          </>
        )}
        {labelType === 'RACK' && (
          <>
            {field('title', 'Title')}
            {field('subtitle', 'Subtitle (optional)')}
            {field('location', 'Location (e.g. FOH, Floor)')}
          </>
        )}

        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          style={{ width: 70 }}
        />
        <button type="submit">Add label</button>
      </form>
      {error && <p className="error">{error}</p>}

      {sectionItems.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: '1rem' }}>
            Every field is editable in place (click and type, saves on blur).
          </p>
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
                  <td>{TYPE_LABELS[i.labelType as AdHocType] ?? i.labelType}</td>
                  <td>{renderEditableContent(i)}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      defaultValue={i.quantity}
                      style={{ width: 60 }}
                      onBlur={(e) => updateQuantity(i.id, Number(e.target.value))}
                    />
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
        </>
      )}
      {sectionItems.length === 0 && <p className="muted">No labels yet in this section.</p>}
    </div>
  );
}
