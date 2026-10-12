import { useEffect, useState } from 'react';
import { api, type CrewRateLine } from '../api/client';

const GENERAL_LABEL = 'General day rate';

// Suggestions, not a fixed taxonomy - clicking one just pre-fills the add-line form below with
// that label so it's one click plus an amount, not a strict enum. Anyone can still add a
// completely custom line.
const SUGGESTED_ROLES = [
  'Lighting Technician',
  'Rigger',
  'Operator',
  'Prep Technician',
  'Programmer',
  'Production Manager',
  'Driver',
  'Overtime',
  'Travel day',
];

/**
 * Crew-defined rate card: the general day rate is always visible and effectively required to
 * get anywhere (nothing else appears until it's set); once it has a value, the optional
 * role-specific lines reveal below with a brief animation (see .rate-card-extra in index.css) -
 * both to keep the form from being intimidating up front and to establish "set your baseline
 * rate first, everything else is optional detail on top of it."
 */
export default function RateCardEditor() {
  const [lines, setLines] = useState<CrewRateLine[] | null>(null);
  const [generalAmount, setGeneralAmount] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.crewPortal.rateLines.list().then(setLines).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const general = lines?.find((l) => l.label === GENERAL_LABEL) ?? null;
  const others = lines?.filter((l) => l.label !== GENERAL_LABEL) ?? [];
  const usedLabels = new Set(others.map((l) => l.label));
  const expanded = Boolean(general);

  useEffect(() => {
    if (general) setGeneralAmount(general.amount);
  }, [general]);

  const saveGeneral = async () => {
    if (!generalAmount.trim()) return;
    setError(null);
    try {
      if (general) await api.crewPortal.rateLines.update(general.id, { amount: generalAmount });
      else await api.crewPortal.rateLines.create({ label: GENERAL_LABEL, amount: generalAmount });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addSuggested = async (label: string) => {
    const amount = prompt(`Day rate for ${label}:`);
    if (!amount || !amount.trim()) return;
    setError(null);
    try {
      await api.crewPortal.rateLines.create({ label, amount: amount.trim() });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLabel.trim() || !customAmount.trim()) return;
    setError(null);
    try {
      await api.crewPortal.rateLines.create({ label: customLabel.trim(), amount: customAmount.trim() });
      setCustomLabel('');
      setCustomAmount('');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (lineId: string) => {
    await api.crewPortal.rateLines.remove(lineId);
    refresh();
  };

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="field" style={{ maxWidth: '16rem' }}>
        <label htmlFor="rate-card-general">General day rate</label>
        <div className="row" style={{ gap: '0.5rem' }}>
          <input
            id="rate-card-general"
            value={generalAmount}
            onChange={(e) => setGeneralAmount(e.target.value)}
            onBlur={saveGeneral}
            placeholder="250"
          />
          {generalAmount !== (general?.amount ?? '') && (
            <button type="button" onClick={saveGeneral}>
              Save
            </button>
          )}
        </div>
      </div>

      <div className={`rate-card-extra${expanded ? ' is-open' : ''}`}>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Optional - add a different rate for specific roles, overtime, or anything else clients should know about.
        </p>

        {others.length > 0 && (
          <ul style={{ margin: '0 0 0.5rem' }}>
            {others.map((l) => (
              <li key={l.id}>
                <strong>{l.label}:</strong> {l.amount}{' '}
                <button type="button" className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={() => remove(l.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="rate-card-suggestions">
          {SUGGESTED_ROLES.filter((r) => !usedLabels.has(r)).map((role) => (
            <button key={role} type="button" className="rate-card-suggestion-chip" onClick={() => addSuggested(role)}>
              + {role}
            </button>
          ))}
        </div>

        <form onSubmit={addCustom} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem' }}>
          <div className="field" style={{ width: '12rem' }}>
            <label htmlFor="rate-card-custom-label">Custom label</label>
            <input id="rate-card-custom-label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Kit rental" />
          </div>
          <div className="field" style={{ width: '8rem' }}>
            <label htmlFor="rate-card-custom-amount">Amount</label>
            <input id="rate-card-custom-amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="250" />
          </div>
          <button type="submit">Add rate line</button>
        </form>
      </div>
    </div>
  );
}
