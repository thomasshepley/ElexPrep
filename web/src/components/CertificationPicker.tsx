import { useId, useMemo } from 'react';
import { CREW_CERTIFICATIONS, formatSkills, parseSkills } from '@elexprep/shared';

/**
 * Optional certifications/tickets, tucked behind a <details> disclosure rather than shown
 * inline like SkillPicker — most people hold a handful of these at most, and the application/
 * account forms already have enough always-visible fields (see the user request this answers:
 * "one big dropdown so it doesn't fill up too much"). Reuses the exact same comma-separated-
 * string read/write helpers as SkillPicker (parseSkills/formatSkills are generic despite the
 * name) against CrewProfile.certifications / CrewApplication.certifications.
 */
export default function CertificationPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const idPrefix = useId();
  const selected = useMemo(() => parseSkills(value), [value]);
  const known = selected.filter((s) => (CREW_CERTIFICATIONS as readonly string[]).includes(s));
  const other = selected.filter((s) => !(CREW_CERTIFICATIONS as readonly string[]).includes(s)).join(', ');
  const count = selected.length;

  const toggle = (cert: string) => {
    const next = known.includes(cert) ? known.filter((s) => s !== cert) : [...known, cert];
    onChange(formatSkills([...next, ...parseSkills(other)]));
  };

  const setOther = (text: string) => {
    onChange(formatSkills([...known, ...parseSkills(text)]));
  };

  return (
    <details className="field-disclosure">
      <summary>Certifications &amp; other info{count > 0 ? ` (${count} selected)` : ' (optional)'}</summary>
      <div className="field-disclosure-body">
        <div className="skill-picker">
          {CREW_CERTIFICATIONS.map((cert) => {
            const id = `${idPrefix}-${cert}`;
            return (
              <label key={cert} htmlFor={id} className="skill-picker-chip">
                <input id={id} type="checkbox" checked={known.includes(cert)} onChange={() => toggle(cert)} />
                {cert}
              </label>
            );
          })}
        </div>
        <input
          aria-label="Other certifications, comma separated"
          placeholder="Other (comma separated)"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          style={{ marginTop: '0.5rem' }}
        />
      </div>
    </details>
  );
}
