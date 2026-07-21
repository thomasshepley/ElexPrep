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

function summarize(labelType: string, content: Record<string, unknown>): string {
  switch (labelType) {
    case 'TRUSS_SPIKE_POSITION':
      return String(content.address ?? '');
    case 'TRUSS_SPIKE_TIP':
      return String(content.text ?? 'DO NOT TIP');
    case 'TRUSS_SPIKE_SACN':
      return `${content.ipAddress ?? ''} / ${content.subnetMask ?? '255.0.0.0'}`;
    case 'CABLE':
      return `${content.text ?? ''}${content.isDmx ? ' (DMX, narrow)' : ''}`;
    case 'PAL':
      return `${content.location ?? ''} — ${content.title ?? ''} ${content.subtitle ?? ''}`;
    case 'RACK':
      return `${content.title ?? ''} ${content.subtitle ?? ''}`;
    default:
      return JSON.stringify(content);
  }
}

export default function AdHocLabelsPanel({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<AdHocLabel[]>([]);
  const [labelType, setLabelType] = useState<AdHocType>('PAL');
  const [quantity, setQuantity] = useState(1);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isDmx, setIsDmx] = useState(false);

  const refresh = () => api.adHocLabels.list(jobId).then(setItems);

  useEffect(() => {
    refresh();
  }, [jobId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let content: Record<string, unknown> = {};
    if (labelType === 'TRUSS_SPIKE_POSITION') content = { address: Number(fields.address) };
    if (labelType === 'TRUSS_SPIKE_TIP') content = { text: fields.text || 'DO NOT TIP' };
    if (labelType === 'TRUSS_SPIKE_SACN') content = { ipAddress: fields.ipAddress, subnetMask: fields.subnetMask || '255.0.0.0' };
    if (labelType === 'CABLE') content = { text: fields.text, isDmx };
    if (labelType === 'PAL') content = { location: fields.location, title: fields.title, subtitle: fields.subtitle };
    if (labelType === 'RACK') content = { title: fields.title, subtitle: fields.subtitle };

    await api.adHocLabels.create(jobId, { labelType, content, quantity });
    setFields({});
    setQuantity(1);
    setIsDmx(false);
    refresh();
  };

  const remove = async (id: string) => {
    await api.adHocLabels.remove(jobId, id);
    refresh();
  };

  const field = (key: string, placeholder: string) => (
    <input
      placeholder={placeholder}
      value={fields[key] ?? ''}
      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
    />
  );

  return (
    <div className="panel">
      <h3>Ad hoc / one-off labels</h3>
      <p className="muted">
        For anything that isn't in the patch — personal Peli cases, generic equipment cases,
        cable runs, spike tip warnings, network node labels, rack labels.
      </p>
      <form className="row" onSubmit={submit}>
        <select value={labelType} onChange={(e) => setLabelType(e.target.value as AdHocType)}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {labelType === 'TRUSS_SPIKE_POSITION' && field('address', 'Position number')}
        {labelType === 'TRUSS_SPIKE_TIP' && field('text', 'Text (default: DO NOT TIP)')}
        {labelType === 'TRUSS_SPIKE_SACN' && (
          <>
            {field('ipAddress', 'IP address')}
            {field('subnetMask', 'Subnet mask (default 255.0.0.0)')}
          </>
        )}
        {labelType === 'CABLE' && (
          <>
            {field('text', 'Cable/circuit text')}
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

      {items.length > 0 && (
        <table style={{ marginTop: '1rem' }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Content</th>
              <th>Qty</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.labelType}</td>
                <td>{summarize(i.labelType, i.content)}</td>
                <td>{i.quantity}</td>
                <td>
                  <button className="secondary" onClick={() => remove(i.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
