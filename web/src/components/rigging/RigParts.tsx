import type { PointResult, PointState, RigSettings } from '@elexprep/shared';

/** Every state is a word and a shape as well as a colour. Never "safe" or "approved". */
export const STATE_LABEL: Record<PointState, string> = {
  ok: 'OK',
  warning: 'Warning',
  over: 'Over capacity',
  unknown: 'Unknown capacity',
  uplift: 'Uplift',
};

export const kg = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `${Math.round(n * 10) / 10} kg`);
export const pct = (u: number | null) => (u === null ? '' : `${Math.round(u * 100)}%`);

const R = 40;
const START = 210; // degrees, clockwise from 12 o'clock: the open gap sits at the bottom
const SWEEP = 300;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * An open ring with a gap at the bottom, filled to the share of capacity used and stopping full
 * past 100 percent (a hatched track and a "+12%" badge take over). A tick marks the warning
 * threshold. Unknown capacity is a dashed ring, not a green one.
 */
export function RingGauge({ r, settings, size = 96, compact, x, y }: { r: PointResult; settings: RigSettings; size?: number; compact?: boolean; x?: number; y?: number }) {
  const u = r.utilisation;
  const filled = u === null ? 0 : Math.min(1, Math.max(0, u));
  const end = START + SWEEP * filled;
  const warnDeg = START + (SWEEP * Math.min(settings.warnAtPct, 100)) / 100;
  const [tx1, ty1] = polar(50, 50, R - 7, warnDeg);
  const [tx2, ty2] = polar(50, 50, R + 7, warnDeg);
  const over = u !== null && u * 100 > 100;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} x={x} y={y} className={`rig-ring is-${r.state}`} role="img" aria-label={`${r.name}: ${kg(r.pointLoadKg)}${r.capacityKg ? ` of ${kg(r.capacityKg)}` : ''}, ${STATE_LABEL[r.state]}`}>
      <path d={arc(50, 50, R, START, START + SWEEP)} className={`rig-ring-track${r.state === 'unknown' ? ' is-dashed' : ''}${over ? ' is-hatched' : ''}`} />
      {filled > 0 && <path d={arc(50, 50, R, START, Math.max(START + 0.5, end))} className="rig-ring-fill" />}
      {r.capacityKg && <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} className="rig-ring-tick" />}
      <text x="50" y={compact ? 55 : 50} className="rig-ring-value">
        {Math.round(r.pointLoadKg)}
      </text>
      {!compact && (
        <text x="50" y="64" className="rig-ring-unit">
          {r.capacityKg ? `of ${Math.round(r.capacityKg)} kg` : 'kg'}
        </text>
      )}
      {over && !compact && (
        <text x="50" y="88" className="rig-ring-over">
          +{Math.round(u! * 100 - 100)}%
        </text>
      )}
    </svg>
  );
}

const SEGMENTS: { key: keyof PointResult['breakdown'] | 'margin'; label: string }[] = [
  { key: 'truss', label: 'Truss' },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'cable', label: 'Cable' },
  { key: 'direct', label: 'Hung on the point' },
  { key: 'accessories', label: 'Other' },
  { key: 'rigging', label: 'Rigging' },
  { key: 'hoist', label: 'Hoist' },
  { key: 'margin', label: 'Margin' },
];

/** Where the load comes from, as one stacked bar with a legend. */
export function BreakdownBar({ r }: { r: PointResult }) {
  const margin = r.pointLoadKg - r.staticKg;
  const values = SEGMENTS.map((s) => ({ ...s, kg: s.key === 'margin' ? margin : Math.max(0, r.breakdown[s.key as keyof PointResult['breakdown']]) })).filter((s) => s.kg > 0.05);
  const total = values.reduce((n, v) => n + v.kg, 0) || 1;
  return (
    <div className="rig-breakdown">
      <div className="rig-breakdown-bar" aria-hidden="true">
        {values.map((v) => (
          <span key={v.key} className={`rig-seg rig-seg-${v.key}`} style={{ width: `${(v.kg / total) * 100}%` }} />
        ))}
      </div>
      <ul className="rig-breakdown-legend">
        {values.map((v) => (
          <li key={v.key}>
            <span className={`rig-swatch rig-seg-${v.key}`} aria-hidden="true" />
            {v.label} {kg(v.kg)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One point: the gauge, its state, headroom and where the load comes from. */
export function PointCard({
  r,
  settings,
  hoistLabel,
  trussName,
  selected,
  onSelect,
  explain,
}: {
  r: PointResult;
  settings: RigSettings;
  hoistLabel?: string | null;
  trussName?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  /** Show the full working underneath. */
  explain?: boolean;
}) {
  const headroom = r.capacityKg ? r.capacityKg - r.pointLoadKg : null;
  const body = (
    <>
      <div className="rig-card-head">
        <div>
          <strong className="rig-card-name">{r.name}</strong>
          <div className="muted rig-card-sub">
            {r.kind === 'cablePick' ? 'Cable pick' : r.kind === 'deadHang' ? 'Dead hang' : hoistLabel ?? 'No hoist set'}
            {trussName ? ` · ${trussName}` : ''}
          </div>
        </div>
        <span className={`rig-state is-${r.state}`}>
          {STATE_LABEL[r.state]}
          {r.utilisation !== null ? ` ${pct(r.utilisation)}` : ''}
        </span>
      </div>
      <div className="rig-card-main">
        <RingGauge r={r} settings={settings} />
        <dl className="rig-card-facts">
          <div>
            <dt>Point load</dt>
            <dd>{kg(r.pointLoadKg)}</dd>
          </div>
          <div>
            <dt>Capacity (SWL)</dt>
            <dd>
              {r.capacityKg ? kg(r.capacityKg) : 'Not set'}
              {r.capacitySource && <span className="muted"> ({r.capacitySource === 'PLOT' ? 'plot' : r.capacitySource === 'VENUE' ? 'venue' : 'entered'})</span>}
            </dd>
          </div>
          <div>
            <dt>Headroom</dt>
            <dd className={headroom !== null && headroom < 0 ? 'rig-neg' : ''}>{headroom === null ? '-' : kg(headroom)}</dd>
          </div>
          <div>
            <dt>Applied (plot figure)</dt>
            <dd>{kg(r.appliedKg)}</dd>
          </div>
        </dl>
      </div>
      <BreakdownBar r={r} />
      {r.overHoistRating && <p className="rig-flag">More than the hoist's rated load ({kg(r.hoistRatedKg)}).</p>}
    </>
  );
  return (
    <article className={`rig-card is-${r.state}${selected ? ' is-selected' : ''}`}>
      {onSelect ? (
        <button type="button" className="rig-card-button" onClick={onSelect} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        body
      )}
      {explain && <Explainer r={r} settings={settings} />}
    </article>
  );
}

/** The sum written out: each contribution, the method, and how the headline is reached. */
export function Explainer({ r, settings }: { r: PointResult; settings: RigSettings }) {
  const main = r.contributions.filter((c) => Math.abs(c.kg) >= 1);
  const small = r.contributions.filter((c) => Math.abs(c.kg) < 1);
  const methodLabel =
    settings.method === 'envelope' ? 'larger of tributary and continuous beam' : settings.method === 'tributary' ? 'tributary (each span on its own)' : 'continuous beam (all hoists level)';
  return (
    <div className="rig-explain">
      <h4>How {r.name} is worked out</h4>
      {r.kind !== 'cablePick' && (
        <p className="muted">
          Truss reaction by the {methodLabel}: {kg(r.trussReactionKg)} (tributary {kg(r.byMethod.tributary)}, continuous {kg(r.byMethod.continuous)}).
        </p>
      )}
      <table className="rig-explain-table">
        <tbody>
          {main.map((c, i) => (
            <tr key={i}>
              <td>{c.label}</td>
              <td className="num">{kg(c.kg)}</td>
            </tr>
          ))}
          {small.length > 0 && (
            <tr>
              <td>
                {small.length} smaller items under 1 kg each
                {small.some((c) => c.kg < 0) ? ' (some negative: loads beyond the next hoist lift this end a little)' : ''}
              </td>
              <td className="num">{kg(small.reduce((n, c) => n + c.kg, 0))}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <th>Point load</th>
            <th className="num">{kg(r.pointLoadKg)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
