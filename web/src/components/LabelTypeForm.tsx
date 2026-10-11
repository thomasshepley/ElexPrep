import { useState } from 'react';

export const AD_HOC_TYPES = ['TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'CABLE', 'PAL', 'RACK'] as const;
export type AdHocType = (typeof AD_HOC_TYPES)[number];

export const TYPE_LABELS: Record<AdHocType, string> = {
  TRUSS_SPIKE_POSITION: 'Truss/Spike — position number',
  TRUSS_SPIKE_TIP: 'Truss/Spike — DO NOT TIP',
  TRUSS_SPIKE_SACN: 'Truss/Spike — sACN node (IP)',
  CABLE: 'Cable label',
  PAL: 'PAL case label (generic, e.g. personal Peli case)',
  RACK: 'Rack label',
};

/** The one place that knows how each ad hoc label type's free-text fields map onto its content shape — shared by LabelsPanel (admin) and the crew request form, so the two never drift apart. */
export function buildLabelContent(labelType: AdHocType, fields: Record<string, string>, isDmx: boolean): Record<string, unknown> {
  switch (labelType) {
    case 'TRUSS_SPIKE_POSITION':
      return { address: Number(fields.address), location: fields.location };
    case 'TRUSS_SPIKE_TIP':
      return { text: fields.text || 'DO NOT TIP', location: fields.location };
    case 'TRUSS_SPIKE_SACN':
      return { ipAddress: fields.ipAddress, subnetMask: fields.subnetMask || '255.0.0.0', location: fields.location };
    case 'CABLE':
      return { text: fields.text, isDmx, location: fields.location };
    case 'PAL':
      return { location: fields.location, title: fields.title, subtitle: fields.subtitle };
    case 'RACK':
      return { title: fields.title, subtitle: fields.subtitle, location: fields.location };
  }
}

/**
 * The actual label-creator form: a type selector (when more than one type is offered) plus
 * that type's content fields and a quantity — the same fields LabelsPanel always used, just
 * extracted so the crew request form can present a real label creator instead of a free-text
 * box standing in for one.
 */
export default function LabelTypeForm({
  types,
  onSubmit,
  submitLabel = 'Add label',
}: {
  types: AdHocType[];
  onSubmit: (labelType: AdHocType, content: Record<string, unknown>, quantity: number) => Promise<void>;
  submitLabel?: string;
}) {
  const [labelType, setLabelType] = useState<AdHocType>(types[0]);
  const [quantity, setQuantity] = useState(1);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isDmx, setIsDmx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: string, placeholder: string) => (
    <input placeholder={placeholder} value={fields[key] ?? ''} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} />
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const content = buildLabelContent(labelType, fields, isDmx);
    try {
      await onSubmit(labelType, content, quantity);
      setFields({});
      setQuantity(1);
      setIsDmx(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
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

        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ width: 70 }} />
        <button type="submit">{submitLabel}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
