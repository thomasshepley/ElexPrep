import { useEffect, useRef, useState } from 'react';
import { PACK_CATEGORY_LABEL, type PlacedStack, type VehicleLike, type VehiclePack } from '@elexprep/shared';

export const kg = (n: number) => `${Math.round(n).toLocaleString('en-GB')} kg`;
export const metres = (mm: number) => `${(mm / 1000).toFixed(mm < 10000 ? 2 : 1).replace(/\.?0+$/, '')} m`;

/** The width of an element, kept up to date, so the drawings are in real pixels at any size. */
function useWidth(fallback = 800) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A stack in words: "3 x Robe MegaPointe, stacked 3 high". */
export function stackLabel(s: PlacedStack) {
  const groups = new Map<string, number>();
  for (const c of s.cases) groups.set(c.label, (groups.get(c.label) ?? 0) + 1);
  const what = [...groups.entries()].map(([l, n]) => (n > 1 ? `${n} x ${l}` : l)).join(' on ');
  return s.cases.length > 1 ? `${what}, ${s.cases.length} high` : what;
}

/** Where a stack sits, the way a crew would say it. */
export function stackWhere(s: PlacedStack, v: VehicleLike) {
  const width = s.body === 1 && v.trailer ? v.trailer.widthMm : v.widthMm;
  const mid = s.yMm + s.widthMm / 2;
  const side = s.widthMm > width * 0.66 ? 'full width' : mid < width / 3 ? 'left' : mid > (width * 2) / 3 ? 'right' : 'middle';
  const along =
    s.body === 1 ? (s.xMm < 50 ? 'in the trailer, against its front' : `in the trailer, ${metres(s.xMm)} from its front`) : s.xMm < 50 ? 'against the bulkhead' : `${metres(s.xMm)} from the cab`;
  return `${along}, ${side}`;
}

interface ViewProps {
  pack: VehiclePack;
  vehicle: VehicleLike;
  /** Stacks loaded so far: those after it are left out. */
  step: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const cat = (s: PlacedStack) => `tp-cat-${s.category.toLowerCase()}`;

/** The load spaces end to end (a drawbar's truck then trailer), and how big the drawing is. */
function layout(pack: VehiclePack) {
  const bodies = pack.bodies;
  const span = bodies.reduce((n, b) => Math.max(n, b.xMm + b.lengthMm), 0);
  const width = Math.max(...bodies.map((b) => b.widthMm));
  const height = Math.max(...bodies.map((b) => b.heightMm));
  const ax = (s: PlacedStack) => (bodies[s.body]?.xMm ?? 0) + s.xMm;
  return { bodies, span, width, height, ax };
}

/**
 * From above, cab on the left and doors on the right: every stack at its real size and place,
 * numbered in loading order, with how high it's stacked and the centre of the weight. A drawbar's
 * trailer is drawn behind its truck.
 */
export function PlanView({ pack, vehicle: v, step, selectedId, onSelect }: ViewProps) {
  const [ref, W] = useWidth();
  const { bodies, span, width, ax } = layout(pack);
  const padL = 46;
  const padR = 26;
  const padY = 26;
  // Short, wide vans would otherwise draw taller than the screen.
  const scale = Math.min((W - padL - padR) / span, 220 / width);
  const H = width * scale + padY * 2;
  const X = (mm: number) => padL + mm * scale;
  const Y = (mm: number) => padY + mm * scale;
  const shown = pack.stacks.filter((s) => s.step <= step);
  const side = v.arch ? (v.widthMm - v.arch.clearWidthMm) / 2 : 0;
  return (
    <div className="tp-drawing" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.name} from above, ${shown.length} of ${pack.stacks.length} stacks loaded`}>
        <defs>
          <pattern id="tp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="tp-hatch-line" />
          </pattern>
        </defs>
        {/* The cab and the doors, so it's clear which way round it is. */}
        <path d={`M ${X(0) - 6} ${Y(0) + 6} h -22 a 10 10 0 0 0 -10 10 V ${Y(v.widthMm) - 16} a 10 10 0 0 0 10 10 h 22`} className="tp-cab" />
        <text x={X(0) - 22} y={Y(v.widthMm / 2)} className="tp-end-label" textAnchor="middle" transform={`rotate(-90 ${X(0) - 22} ${Y(v.widthMm / 2)})`}>
          Cab
        </text>
        {bodies.map((b, bi) => (
          <g key={bi}>
            <rect x={X(b.xMm)} y={Y(0)} width={b.lengthMm * scale} height={b.widthMm * scale} className="tp-floor" />
            {/* A tick every metre along each floor. */}
            {Array.from({ length: Math.floor(b.lengthMm / 1000) + 1 }, (_, i) => (
              <g key={i}>
                <line x1={X(b.xMm + i * 1000)} y1={Y(b.widthMm)} x2={X(b.xMm + i * 1000)} y2={Y(b.widthMm) + 5} className="tp-tick" />
                {i % (scale * 1000 < 40 ? 2 : 1) === 0 && (
                  <text x={X(b.xMm + i * 1000)} y={Y(b.widthMm) + 16} className="tp-tick-label" textAnchor="middle">
                    {i}
                  </text>
                )}
              </g>
            ))}
            <line x1={X(b.xMm + b.lengthMm) + 4} y1={Y(0)} x2={X(b.xMm + b.lengthMm) + 4} y2={Y(b.widthMm)} className="tp-doors" />
            {bodies.length > 1 && (
              <text x={X(b.xMm + b.lengthMm / 2)} y={Y(0) - 8} className="tp-end-label" textAnchor="middle">
                {b.label}
              </text>
            )}
            {/* The drawbar between the truck and its trailer. */}
            {bi > 0 && <line x1={X(bodies[bi - 1].xMm + bodies[bi - 1].lengthMm) + 8} y1={Y(b.widthMm / 2)} x2={X(b.xMm)} y2={Y(b.widthMm / 2)} className="tp-drawbar" />}
          </g>
        ))}
        {v.arch && side > 0 && (
          <>
            <rect x={X(v.arch.fromMm)} y={Y(0)} width={(v.arch.toMm - v.arch.fromMm) * scale} height={side * scale} fill="url(#tp-hatch)" className="tp-arch" />
            <rect x={X(v.arch.fromMm)} y={Y(v.widthMm - side)} width={(v.arch.toMm - v.arch.fromMm) * scale} height={side * scale} fill="url(#tp-hatch)" className="tp-arch" />
          </>
        )}
        <text x={X(span) + 16} y={H / 2} className="tp-end-label" textAnchor="middle" transform={`rotate(90 ${X(span) + 16} ${H / 2})`}>
          Doors
        </text>
        {shown.map((s) => {
          const w = s.lengthMm * scale;
          const h = s.widthMm * scale;
          const current = s.step === step && step < pack.stacks.length;
          const x = X(ax(s));
          return (
            <g
              key={s.id}
              className={`tp-stack ${cat(s)}${s.id === selectedId ? ' is-selected' : ''}${current ? ' is-current' : ''}`}
              onClick={() => onSelect(s.id)}
              role="button"
              tabIndex={0}
              aria-label={`Step ${s.step}: ${stackLabel(s)}, ${kg(s.kg)}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s.id)}
            >
              <rect x={x + 0.75} y={Y(s.yMm) + 0.75} width={Math.max(1, w - 1.5)} height={Math.max(1, h - 1.5)} rx={2} />
              {w > 22 && h > 14 && (
                <text x={x + w / 2} y={Y(s.yMm) + h / 2 + 4} textAnchor="middle" className="tp-stack-num">
                  {s.step}
                </text>
              )}
              {s.cases.length > 1 && w > 34 && h > 26 && (
                <text x={x + w - 4} y={Y(s.yMm) + 11} textAnchor="end" className="tp-stack-high">
                  x{s.cases.length}
                </text>
              )}
            </g>
          );
        })}
        {pack.cog && step >= pack.stacks.length && (
          <g className="tp-cog" aria-label="Centre of the weight">
            <circle cx={X((pack.cog.xPct / 100) * v.lengthMm)} cy={Y((pack.cog.yPct / 100) * v.widthMm)} r={7} />
            <line x1={X((pack.cog.xPct / 100) * v.lengthMm) - 11} y1={Y((pack.cog.yPct / 100) * v.widthMm)} x2={X((pack.cog.xPct / 100) * v.lengthMm) + 11} y2={Y((pack.cog.yPct / 100) * v.widthMm)} />
            <line x1={X((pack.cog.xPct / 100) * v.lengthMm)} y1={Y((pack.cog.yPct / 100) * v.widthMm) - 11} x2={X((pack.cog.xPct / 100) * v.lengthMm)} y2={Y((pack.cog.yPct / 100) * v.widthMm) + 11} />
          </g>
        )}
      </svg>
    </div>
  );
}

/** From the left side: how high every stack goes against the roof. */
export function SideView({ pack, vehicle: v, step, selectedId, onSelect }: ViewProps) {
  const [ref, W] = useWidth();
  const { bodies, span, height, ax } = layout(pack);
  const padL = 46;
  const padR = 26;
  const scale = Math.min((W - padL - padR) / span, 220 / height);
  const padTop = 18;
  const H = height * scale + padTop + 30;
  const X = (mm: number) => padL + mm * scale;
  const Z = (mm: number) => padTop + (height - mm) * scale;
  // The far side first, so nearer stacks are drawn over it.
  const shown = pack.stacks.filter((s) => s.step <= step).sort((a, b) => b.yMm - a.yMm);
  return (
    <div className="tp-drawing" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.name} from the side`}>
        {bodies.map((b, bi) => (
          <g key={bi}>
            <rect x={X(b.xMm)} y={Z(b.heightMm)} width={b.lengthMm * scale} height={b.heightMm * scale} className="tp-floor" />
            <line x1={X(b.xMm)} y1={Z(b.heightMm - 50)} x2={X(b.xMm + b.lengthMm)} y2={Z(b.heightMm - 50)} className="tp-roofline" />
            {bi > 0 && <line x1={X(bodies[bi - 1].xMm + bodies[bi - 1].lengthMm)} y1={Z(0) - 4} x2={X(b.xMm)} y2={Z(0) - 4} className="tp-drawbar" />}
            {bodies.length > 1 && (
              <text x={X(b.xMm + b.lengthMm / 2)} y={H - 6} className="tp-end-label" textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        ))}
        <text x={X(0) - 6} y={Z(height) + 10} textAnchor="end" className="tp-tick-label">
          {metres(height)}
        </text>
        <text x={X(0) - 6} y={Z(0)} textAnchor="end" className="tp-tick-label">
          0
        </text>
        <text x={X(0)} y={H - 6} className="tp-end-label">
          Cab
        </text>
        <text x={X(span)} y={H - 6} className="tp-end-label" textAnchor="end">
          Doors
        </text>
        {shown.map((s) => (
          <g key={s.id} className={`tp-stack ${cat(s)}${s.id === selectedId ? ' is-selected' : ''}${s.step === step && step < pack.stacks.length ? ' is-current' : ''}`} onClick={() => onSelect(s.id)}>
            {s.cases.map((c, i) => {
              const l = (s.rotated ? c.widthMm : c.lengthMm) * scale;
              return <rect key={i} x={X(ax(s)) + 0.75} y={Z(c.zMm + c.heightMm) + 0.75} width={Math.max(1, l - 1.5)} height={Math.max(1, c.heightMm * scale - 1.5)} rx={1.5} />;
            })}
            {s.lengthMm * scale > 22 && !shown.some((o) => o !== s && o.body === s.body && o.yMm < s.yMm && o.xMm < s.xMm + s.lengthMm && s.xMm < o.xMm + o.lengthMm) && (
              <text x={X(ax(s)) + (s.lengthMm * scale) / 2} y={Z(s.heightMm) - 4} textAnchor="middle" className="tp-side-num">
                {s.step}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * A 3D view at an angle, drawn case by case, for seeing the stacks the way the crew will. The
 * receding axis is the width of the vehicle; each case shows its front, top and right side.
 */
export function IsoView({ pack, vehicle: v, step, selectedId, onSelect }: ViewProps) {
  const [ref, W] = useWidth();
  const { bodies, span, width, height, ax } = layout(pack);
  const k = 0.5;
  const a = (32 * Math.PI) / 180;
  const depthX = width * k * Math.cos(a);
  const depthY = width * k * Math.sin(a);
  const pad = 20;
  const scale = (W - pad * 2) / (span + depthX);
  const H = (height + depthY) * scale + pad * 2;
  // y runs into the picture, up and to the right (the left wall nearest), z up.
  const P = (x: number, y: number, z: number) => [pad + (x + y * k * Math.cos(a)) * scale, pad + (height - z + (width - y) * k * Math.sin(a)) * scale] as const;
  const poly = (pts: (readonly [number, number])[]) => pts.map((p) => p.join(',')).join(' ');
  const boxes = pack.stacks
    .filter((s) => s.step <= step)
    .flatMap((s) =>
      s.cases.map((c, i) => {
        const l = s.rotated ? c.widthMm : c.lengthMm;
        const w = s.rotated ? c.lengthMm : c.widthMm;
        // Smaller cases on top sit centred on the one below.
        const x = ax(s) + (s.lengthMm - l) / 2;
        const y = s.yMm + (s.widthMm - w) / 2;
        return { s, i, x, y, z: c.zMm, l, w, h: c.heightMm };
      })
    )
    // The far wall first, then from the cab back, then upwards.
    .sort((p, q) => q.y + q.w - (p.y + p.w) || p.x - q.x || p.z - q.z);
  return (
    <div className="tp-drawing" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.name} in 3D`}>
        {bodies.map((b, bi) => {
          const x0 = b.xMm;
          const x1 = b.xMm + b.lengthMm;
          return (
            <g key={bi}>
              <polygon points={poly([P(x0, 0, 0), P(x1, 0, 0), P(x1, b.widthMm, 0), P(x0, b.widthMm, 0)])} className="tp-floor" />
              {/* The far wall and the front, faint, for depth. */}
              <polygon points={poly([P(x0, b.widthMm, 0), P(x1, b.widthMm, 0), P(x1, b.widthMm, b.heightMm), P(x0, b.widthMm, b.heightMm)])} className="tp-wall" />
              <polygon points={poly([P(x0, 0, 0), P(x0, b.widthMm, 0), P(x0, b.widthMm, b.heightMm), P(x0, 0, b.heightMm)])} className="tp-wall" />
            </g>
          );
        })}
        {boxes.map((b) => {
          const sel = b.s.id === selectedId;
          const current = b.s.step === step && step < pack.stacks.length;
          return (
            <g key={`${b.s.id}:${b.i}`} className={`tp-box ${cat(b.s)}${sel ? ' is-selected' : ''}${current ? ' is-current' : ''}`} onClick={() => onSelect(b.s.id)}>
              <polygon className="tp-face-front" points={poly([P(b.x, b.y, b.z), P(b.x + b.l, b.y, b.z), P(b.x + b.l, b.y, b.z + b.h), P(b.x, b.y, b.z + b.h)])} />
              <polygon className="tp-face-top" points={poly([P(b.x, b.y, b.z + b.h), P(b.x + b.l, b.y, b.z + b.h), P(b.x + b.l, b.y + b.w, b.z + b.h), P(b.x, b.y + b.w, b.z + b.h)])} />
              <polygon className="tp-face-side" points={poly([P(b.x + b.l, b.y, b.z), P(b.x + b.l, b.y + b.w, b.z), P(b.x + b.l, b.y + b.w, b.z + b.h), P(b.x + b.l, b.y, b.z + b.h)])} />
            </g>
          );
        })}
        {/* Each open end and the roof edge over the near side. */}
        {bodies.map((b, bi) => (
          <g key={bi}>
            <polyline points={poly([P(b.xMm + b.lengthMm, 0, 0), P(b.xMm + b.lengthMm, 0, b.heightMm), P(b.xMm + b.lengthMm, b.widthMm, b.heightMm)])} className="tp-outline" />
            <polyline points={poly([P(b.xMm, 0, b.heightMm), P(b.xMm + b.lengthMm, 0, b.heightMm)])} className="tp-outline" />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="tp-legend">
      {(Object.keys(PACK_CATEGORY_LABEL) as (keyof typeof PACK_CATEGORY_LABEL)[]).map((c) => (
        <li key={c}>
          <span className={`tp-swatch tp-cat-${c.toLowerCase()}`} aria-hidden="true" />
          {PACK_CATEGORY_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}
