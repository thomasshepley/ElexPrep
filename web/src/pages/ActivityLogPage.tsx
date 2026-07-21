import { useEffect, useState } from 'react';
import { api, type ActivityLogEntry } from '../api/client';

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);

  useEffect(() => {
    api.activity.list().then(setEntries);
  }, []);

  return (
    <div>
      <h1>Activity log</h1>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted">{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.userName ?? <span className="muted">—</span>}</td>
              <td>{e.action}</td>
              <td>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
