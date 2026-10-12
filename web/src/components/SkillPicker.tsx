import { useId, useMemo } from 'react';
import { CREW_SKILLS, formatSkills, parseSkills } from '@elexprep/shared';

/**
 * Multi-select for the fixed crew skill taxonomy, plus a free-text "other" catch-all so an
 * existing record's non-taxonomy skills (or a genuinely unusual one) are never dropped. Reads
 * and writes the same comma-separated string CrewProfile.skills/CrewApplication.skills already
 * store - used by both the admin crew form and the public application form (see LabelTypeForm
 * for the equivalent shared-component pattern with ad hoc labels).
 */
export default function SkillPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const idPrefix = useId();
  const selected = useMemo(() => parseSkills(value), [value]);
  const known = selected.filter((s) => (CREW_SKILLS as readonly string[]).includes(s));
  const other = selected.filter((s) => !(CREW_SKILLS as readonly string[]).includes(s)).join(', ');

  const toggle = (skill: string) => {
    const next = known.includes(skill) ? known.filter((s) => s !== skill) : [...known, skill];
    onChange(formatSkills([...next, ...parseSkills(other)]));
  };

  const setOther = (text: string) => {
    onChange(formatSkills([...known, ...parseSkills(text)]));
  };

  return (
    <div className="field">
      <label>Skills / roles</label>
      <div className="skill-picker">
        {CREW_SKILLS.map((skill) => {
          const id = `${idPrefix}-${skill}`;
          return (
            <label key={skill} htmlFor={id} className="skill-picker-chip">
              <input id={id} type="checkbox" checked={known.includes(skill)} onChange={() => toggle(skill)} />
              {skill}
            </label>
          );
        })}
      </div>
      <input
        aria-label="Other skills, comma separated"
        placeholder="Other (comma separated)"
        value={other}
        onChange={(e) => setOther(e.target.value)}
        style={{ marginTop: '0.5rem' }}
      />
    </div>
  );
}
