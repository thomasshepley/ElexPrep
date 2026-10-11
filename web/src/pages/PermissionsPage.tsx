import { useEffect, useState } from 'react';
import { api, type PermissionKey } from '../api/client';

export default function PermissionsPage() {
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
    <div>
      <h1>Permissions</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        ADMIN can always do everything, and SIGNAGE is always view-only — these toggles control
        what the USER role can additionally do, beyond its normal day-to-day prep work. Everything
        below is off by default until you turn it on.
      </p>
      <div className="panel">
        <h3>USER role capabilities</h3>
        {!permissions && <p className="muted">Loading…</p>}
        {permissions && (
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
        )}
        {saved && <p className="muted">Saved ✓</p>}
      </div>
    </div>
  );
}
