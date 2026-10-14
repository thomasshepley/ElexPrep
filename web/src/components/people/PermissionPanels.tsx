import { SkeletonRegion, SkeletonRows } from '../Skeleton';
import { useEffect, useState } from 'react';
import { api, type PermissionKey } from '../../api/client';

export function UserPermissionsPanel({ userId }: { userId: string }) {
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [override, setOverride] = useState<Partial<Record<PermissionKey, boolean>> | null>(null);
  const [keys, setKeys] = useState<PermissionKey[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    api.permissions
      .getUser(userId)
      .then((res) => {
        setPermissions(res.permissions);
        setOverride(res.override);
        setKeys(res.keys);
        setLabels(res.labels);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    setError(null);
    try {
      const res = await api.permissions.updateUser(userId, { [key]: value });
      setPermissions(res.permissions);
      setOverride((o) => ({ ...o, [key]: value }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const clearOverride = async () => {
    setError(null);
    try {
      const res = await api.permissions.updateUser(userId, null);
      setPermissions(res.permissions);
      setOverride(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hasOverride = override !== null && Object.keys(override).length > 0;

  return (
    <div style={{ padding: '0.75rem 0' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Permission overrides</strong>
        {hasOverride && (
          <button className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={clearOverride}>
            Clear overrides (revert to role baseline)
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: '0.3rem' }}>
        Starts from what every Prep account can do (set at the bottom of this page); changing one
        here applies to this account only.
      </p>
      {error && <p className="error">{error}</p>}
      {!permissions && <SkeletonRegion><SkeletonRows rows={6} cols={2} /></SkeletonRegion>}
      {permissions && (
        <div className="table-scroll">
          <table>
            <tbody>
              {keys.map((key) => (
                <tr key={key}>
                  <td>{labels[key] ?? key}</td>
                  <td style={{ textAlign: 'right' }}>
                    <label className="switch">
                      <input type="checkbox" checked={permissions[key]} onChange={(e) => toggle(key, e.target.checked)} />
                      <span className="switch-track" />
                      {permissions[key] ? 'Allowed' : 'Not allowed'}
                      {override?.[key] !== undefined && <span className="chip chip-role">Overridden</span>}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The shared USER-role baseline (what every USER account can do by default) - formerly its
 * own top-level Settings page; folded in here so permissions live on the "Users & crew" page, with the
 * per-account override (UserPermissionsPanel, above) right below it as the next layer down. */
export function RoleBaselinePanel() {
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean> | null>(null);
  const [keys, setKeys] = useState<PermissionKey[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.permissions.get().then((res) => {
      setPermissions(res.permissions);
      setKeys(res.keys);
      setLabels(res.labels);
    });
  }, []);

  const toggle = async (key: PermissionKey, value: boolean) => {
    setSaved(false);
    setPermissions((p) => (p ? { ...p, [key]: value } : p));
    const res = await api.permissions.update({ [key]: value });
    setPermissions(res.permissions);
    setSaved(true);
  };

  return (
    <div style={{ paddingTop: '0.5rem' }}>
      {!permissions && <SkeletonRegion><SkeletonRows rows={6} cols={2} /></SkeletonRegion>}
      {permissions && (
        <div className="table-scroll">
          <table>
            <tbody>
              {keys.map((key) => (
                <tr key={key}>
                  <td>{labels[key] ?? key}</td>
                  <td style={{ textAlign: 'right' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={permissions[key]}
                        onChange={(e) => toggle(key, e.target.checked)}
                      />
                      <span className="switch-track" />
                      {permissions[key] ? 'Allowed' : 'Not allowed'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {saved && <p className="muted">Saved ✓</p>}
    </div>
  );
}
