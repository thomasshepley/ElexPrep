import { SkeletonTableRows } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { api, type FixtureTypeRule } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/roles';
import PermissionFieldset from '../components/PermissionFieldset';
import InlineEdit from '../components/InlineEdit';

const PREP_SETTINGS_NOTE = 'You can view these settings, but changing them needs the "Manage prep settings" permission.';

export default function FixtureTypeRulesPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'managePrepSettings');
  const [rulesLoaded, setRules] = useState<FixtureTypeRule[] | null>(null);
  const rules = rulesLoaded ?? [];
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

  const update = async (
    rule: FixtureTypeRule,
    field: 'name' | 'unitsPerCase' | 'caseLabelOverride',
    value: string | number
  ) => {
    if (value === (rule[field] ?? '')) return;
    await api.fixtureTypeRules.update(rule.id, { [field]: value });
    refresh();
  };

  const remove = async (id: string) => {
    await api.fixtureTypeRules.remove(id);
    refresh();
  };

  return (
    <div>
      <h1>Case-packing rules</h1>
      <PermissionFieldset allowed={canEdit} note={PREP_SETTINGS_NOTE}>
      <p className="muted">
        Defines how many units of each fixture type go in a case, e.g. AstraBlade in pairs
        (201 + 202, 203 + 204…), Reflecta in threes (401 - 403), Viper Profile one per case.
        A fixture type with no rule here defaults to one unit per case. Click any value below to
        edit it.
      </p>
      <div className="panel">
        <h3>Add rule</h3>
        <form className="row" onSubmit={create}>
          <input aria-label="Fixture type" placeholder="Fixture type (must match patch exactly)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            type="number"
            min={1}
            required
            aria-label="Units per case"
            value={unitsPerCase || ''}
            onChange={(e) => setUnitsPerCase(e.target.value === '' ? 0 : Math.floor(Number(e.target.value)))}
            style={{ width: 80 }}
          />
          <span className="muted">units / case</span>
          <button type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fixture type</th>
              <th>Units per case</th>
              <th>Case label override</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rulesLoaded === null && <SkeletonTableRows rows={8} cols={5} />}
            {rules.map((r) => (
              <tr key={r.id}>
                <td>
                  <InlineEdit label="Fixture type" value={r.name} onSave={(v) => update(r, 'name', v)} />
                </td>
                <td>
                  <InlineEdit
                    type="number"
                    min={1}
                    label="Units per case"
                    value={r.unitsPerCase}
                    width={40}
                    onSave={(v) => {
                      const n = Math.floor(Number(v));
                      if (!v.trim() || !Number.isFinite(n) || n < 1) throw new Error('Units per case must be 1 or more');
                      return update(r, 'unitsPerCase', n);
                    }}
                  />
                </td>
                <td>
                  <InlineEdit
                    label="Case label override"
                    placeholder="(uses fixture type)"
                    value={r.caseLabelOverride}
                    onSave={(v) => update(r, 'caseLabelOverride', v)}
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
      </PermissionFieldset>
    </div>
  );
}
