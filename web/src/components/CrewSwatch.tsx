/** A small colored dot plus name/role, used wherever a crew member needs to be visually
 * distinguishable at a glance (currently just the schedule calendar's day popup). */
export default function CrewSwatch({ name, role, color }: { name: string; role: string; color: string }) {
  return (
    <div className="crew-swatch-row">
      <span className="crew-swatch-dot" style={{ background: color }} />
      <span>
        {name} <span className="muted">· {role}</span>
      </span>
    </div>
  );
}
