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
  const mid = s.yMm + s.widthMm / 2;
  const side = s.widthMm > v.widthMm * 0.66 ? 'full width' : mid < v.widthMm / 3 ? 'left' : mid > (v.widthMm * 2) / 3 ? 'right' : 'middle';
  const along = s.xMm < 50 ? 'against the bulkhead' : `${metres(s.xMm)} from the cab`;
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

/**
 * From above, cab on the left and doors on the right: every stack at its real size and place,
 * numbered in loading order, with how high it's stacked and the centre of the weight.
 */
export function PlanView({ pack, vehicle: v, step, selectedId, onSelect }: ViewProps) {
  const [ref, W] = useWidth();
  const padL = 46;
  const padR = 26;
  const padY = 26;
  // Short, wide vans would otherwise draw taller than the screen.
  const scale = Math.min((W - padL - padR) / v.lengthMm, 220 / v.widthMm);
  const H = v.widthMm * scale + padY * 2;
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
        <text x={X(0) - 22} y={H / 2} className="tp-end-label" textAnchor="middle" transform={`rotate(-90 ${X(0) - 22} ${H / 2})`}>
          Cab
        </text>
        <rect x={X(0)} y={Y(0)} width={v.lengthMm * scale} height={v.widthMm * scale} className="tp-floor" />
        {v.arch && side > 0 && (
          <>
            <rect x={X(v.arch.fromMm)} y={Y(0)} width={(v.arch.toMm - v.arch.fromMm) * scale} height={side * scale} fill="url(#tp-hatch)" className="tp-arch" />
            <rect x={X(v.arch.fromMm)} y={Y(v.widthMm - side)} width={(v.arch.toMm - v.arch.fromMm) * scale} height={side * scale} fill="url(#tp-hatch)" className="tp-arch" />
          </>
        )}
        {/* A tick every metre along the floor. */}
        {Array.from({ length: Math.floor(v.lengthMm / 1000) + 1 }, (_, i) => (
          <g key={i}>
            <line x1={X(i * 1000)} y1={Y(v.widthMm)} x2={X(i * 1000)} y2={Y(v.widthMm) + 5} className="tp-tick" />
            {(i % (scale * 1000 < 40 ? 2 : 1) === 0) && (
              <text x={X(i * 1000)} y={Y(v.widthMm) + 16} className="tp-tick-label" textAnchor="middle">
                {i}
              </text>
            )}
          </g>
        ))}
        <line x1={X(v.lengthMm) + 8} y1={Y(0)} x2={X(v.lengthMm) + 8} y2={Y(v.widthMm)} className="tp-doors" />
        <text x={X(v.lengthMm) + 18} y={H / 2} className="tp-end-label" textAnchor="middle" transform={`rotate(90 ${X(v.lengthMm) + 18} ${H / 2})`}>
          Doors
        </text>
        {shown.map((s) => {
          const w = s.lengthMm * scale;
          const h = s.widthMm * scale;
          const current = s.step === step && step < pack.stacks.length;
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
              <rect x={X(s.xMm) + 0.75} y={Y(s.yMm) + 0.75} width={Math.max(1, w - 1.5)} height={Math.max(1, h - 1.5)} rx={2} />
              {w > 22 && h > 14 && (
                <text x={X(s.xMm) + w / 2} y={Y(s.yMm) + h / 2 + 4} textAnchor="middle" className="tp-stack-num">
                  {s.step}
                </text>
              )}
              {s.cases.length > 1 && w > 34 && h > 26 && (
                <text x={X(s.xMm) + w - 4} y={Y(s.yMm) + 11} textAnchor="end" className="tp-stack-high">
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
  const padL = 46;
  const padR = 26;
  const scale = Math.min((W - padL - padR) / v.lengthMm, 220 / v.heightMm);
  const padTop = 18;
  const H = v.heightMm * scale + padTop + 30;
  const X = (mm: number) => padL + mm * scale;
  const Z = (mm: number) => padTop + (v.heightMm - mm) * scale;
  // The far side first, so nearer stacks are drawn over it.
  const shown = pack.stacks.filter((s) => s.step <= step).sort((a, b) => b.yMm - a.yMm);
  return (
    <div className="tp-drawing" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.name} from the side`}>
        <rect x={X(0)} y={Z(v.heightMm)} width={v.lengthMm * scale} height={v.heightMm * scale} className="tp-floor" />
        <line x1={X(0)} y1={Z(v.heightMm - 50)} x2={X(v.lengthMm)} y2={Z(v.heightMm - 50)} className="tp-roofline" />
        <text x={X(0) - 6} y={Z(v.heightMm) + 10} textAnchor="end" className="tp-tick-label">
          {metres(v.heightMm)}
        </text>
        <text x={X(0) - 6} y={Z(0)} textAnchor="end" className="tp-tick-label">
          0
        </text>
        <text x={X(0)} y={H - 6} className="tp-end-label">
          Cab
        </text>
        <text x={X(v.lengthMm)} y={H - 6} className="tp-end-label" textAnchor="end">
          Doors
        </text>
        {shown.map((s) => (
          <g key={s.id} className={`tp-stack ${cat(s)}${s.id === selectedId ? ' is-selected' : ''}${s.step === step && step < pack.stacks.length ? ' is-current' : ''}`} onClick={() => onSelect(s.id)}>
            {s.cases.map((c, i) => {
              const l = (s.rotated ? c.widthMm : c.lengthMm) * scale;
              return <rect key={i} x={X(s.xMm) + 0.75} y={Z(c.zMm + c.heightMm) + 0.75} width={Math.max(1, l - 1.5)} height={Math.max(1, c.heightMm * scale - 1.5)} rx={1.5} />;
            })}
            {s.lengthMm * scale > 22 && !shown.some((o) => o !== s && o.yMm < s.yMm && o.xMm < s.xMm + s.lengthMm && s.xMm < o.xMm + o.lengthMm) && (
              <text x={X(s.xMm) + (s.lengthMm * scale) / 2} y={Z(s.heightMm) - 4} textAnchor="middle" className="tp-side-num">
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
  const k = 0.5;
  const a = (32 * Math.PI) / 180;
  const depthX = v.widthMm * k * Math.cos(a);
  const depthY = v.widthMm * k * Math.sin(a);
  const pad = 20;
  const scale = (W - pad * 2) / (v.lengthMm + depthX);
  const H = (v.heightMm + depthY) * scale + pad * 2;
  // y runs into the picture, up and to the right (the left wall nearest), z up.
  const P = (x: number, y: number, z: number) => [pad + (x + y * k * Math.cos(a)) * scale, pad + (v.heightMm - z + (v.widthMm - y) * k * Math.sin(a)) * scale] as const;
  const poly = (pts: (readonly [number, number])[]) => pts.map((p) => p.join(',')).join(' ');
  const boxes = pack.stacks
    .filter((s) => s.step <= step)
    .flatMap((s) =>
      s.cases.map((c, i) => {
        const l = s.rotated ? c.widthMm : c.lengthMm;
        const w = s.rotated ? c.lengthMm : c.widthMm;
        // Smaller cases on top sit centred on the one below.
        const x = s.xMm + (s.lengthMm - l) / 2;
        const y = s.yMm + (s.widthMm - w) / 2;
        return { s, i, x, y, z: c.zMm, l, w, h: c.heightMm };
      })
    )
    // The far wall first, then from the cab back, then upwards.
    .sort((p, q) => q.y + q.w - (p.y + p.w) || p.x - q.x || p.z - q.z);
  const floor = [P(0, 0, 0), P(v.lengthMm, 0, 0), P(v.lengthMm, v.widthMm, 0), P(0, v.widthMm, 0)];
  return (
    <div className="tp-drawing" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${v.name} in 3D`}>
        <polygon points={poly(floor)} className="tp-floor" />
        {/* The far wall and the bulkhead, faint, for depth. */}
        <polygon points={poly([P(0, v.widthMm, 0), P(v.lengthMm, v.widthMm, 0), P(v.lengthMm, v.widthMm, v.heightMm), P(0, v.widthMm, v.heightMm)])} className="tp-wall" />
        <polygon points={poly([P(0, 0, 0), P(0, v.widthMm, 0), P(0, v.widthMm, v.heightMm), P(0, 0, v.heightMm)])} className="tp-wall" />
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
        {/* The open end and the roof edge over the near side. */}
        <polyline points={poly([P(v.lengthMm, 0, 0), P(v.lengthMm, 0, v.heightMm), P(v.lengthMm, v.widthMm, v.heightMm)])} className="tp-outline" />
        <polyline points={poly([P(0, 0, v.heightMm), P(v.lengthMm, 0, v.heightMm)])} className="tp-outline" />
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
