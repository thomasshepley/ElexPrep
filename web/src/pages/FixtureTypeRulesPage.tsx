import { useEffect, useState } from 'react';
import { api, type FixtureTypeRule } from '../api/client';

export default function FixtureTypeRulesPage() {
  const [rules, setRules] = useState<FixtureTypeRule[]>([]);
  const [name, setName] = useState('');
  const [unitsPerCase, setUnitsPerCase] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.fixtureTypeRules.list().then(setRules).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.fixtureTypeRules.create({ name, unitsPerCase });
      setName('');
      setUnitsPerCase(1);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const updateUnits = async (rule: FixtureTypeRule, value: number) => {
    await api.fixtureTypeRules.update(rule.id, { unitsPerCase: value });
    refresh();
  };

  const remove = async (id: string) => {
    await api.fixtureTypeRules.remove(id);
    refresh();
  };

  return (
    <div>
      <h1>Case-packing rules</h1>
      <p className="muted">
        Defines how many units of each fixture type go in a case, e.g. AstraBlade in pairs
        (201 + 202, 203 + 204…), Reflecta in threes (401 - 403), Viper Profile one per case.
        A fixture type with no rule here defaults to one unit per case.
      </p>
      <div className="panel">
        <h3>Add rule</h3>
        <form className="row" onSubmit={create}>
          <input placeholder="Fixture type (must match patch exactly)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            type="number"
            min={1}
            value={unitsPerCase}
            onChange={(e) => setUnitsPerCase(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span className="muted">units / case</span>
          <button type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Fixture type</th>
            <th>Units per case</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  defaultValue={r.unitsPerCase}
                  style={{ width: 70 }}
                  onBlur={(e) => updateUnits(r, Number(e.target.value))}
                />
              </td>
              <td>
                <button type="button" className="secondary" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
