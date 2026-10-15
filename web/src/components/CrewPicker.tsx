import { useId, useState } from 'react';
import { resolveCrewColor } from '@elexprep/shared';

export interface CrewPickerPerson {
  /** The job crew assignment id. */
  id: string;
  crewProfileId: string;
  displayName: string;
  role: string;
  color: string | null;
}

/**
 * A searchable list of a job's crew where each whole row toggles that person on or off - green
 * with a tick when they're in. Used for crew on a schedule entry and members of a chat group.
 */
export default function CrewPicker({
  people,
  selectedIds,
  onToggle,
  label,
  emptyText = 'No crew on this job yet - add them on the Crew tab.',
}: {
  people: CrewPickerPerson[];
  selectedIds: Set<string>;
  onToggle: (person: CrewPickerPerson) => void;
  label: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => `${p.displayName} ${p.role}`.toLowerCase().includes(q)) : people;
  const count = people.filter((p) => selectedIds.has(p.id)).length;

  if (people.length === 0) return <p className="muted" style={{ margin: 0 }}>{emptyText}</p>;

  return (
    <div className="crew-picker">
      <div className="crew-picker-head">
        <span className="muted">
          {count} of {people.length} added
        </span>
        <input
          id={searchId}
          type="search"
          className="crew-picker-search"
          aria-label={`Search ${label}`}
          placeholder="Search name or role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="crew-picker-list" role="group" aria-label={label}>
        {shown.map((p) => {
          const on = selectedIds.has(p.id);
          const color = resolveCrewColor(p.crewProfileId, p.color);
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`crew-picker-row${on ? ' is-on' : ''}`}
                onClick={() => onToggle(p)}
              >
                <span className="crew-picker-avatar" style={{ background: color }} aria-hidden="true">
                  {p.displayName.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="crew-picker-name">
                  {p.displayName}
                  {p.role && <span className="crew-picker-role">{p.role}</span>}
                </span>
                <span className="crew-picker-state" aria-hidden="true">
                  {on ? '✓ Added' : 'Add'}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted crew-picker-none">No one matches "{query}".</li>}
      </ul>
    </div>
  );
}
