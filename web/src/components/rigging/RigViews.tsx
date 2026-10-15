import { useEffect, useRef, useState } from 'react';
import type { PointResult, Rig, RigResult, RigTruss } from '@elexprep/shared';
import { RingGauge, STATE_LABEL, kg, pct } from './RigParts';

/**
 * Plan map: the rig from above at true scale. Trusses as double lines, every point as a ring
 * gauge at its real X/Y (cable picks smaller). Click a point for its card, a truss for its
 * elevation.
 */
export function PlanView({
  rig,
  result,
  selectedPointId,
  selectedTrussId,
  onSelectPoint,
  onSelectTruss,
}: {
  rig: Rig;
  result: RigResult;
  selectedPointId: string | null;
  selectedTrussId: string | null;
  onSelectPoint: (id: string) => void;
  onSelectTruss: (id: string) => void;
}) {
  // Drawn in screen pixels at the container's width, so rings and labels stay readable at any size.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const xs = [...rig.points.map((p) => p.x), ...rig.trusses.flatMap((t) => [t.originX, t.originX + t.lengthM])];
  const ys = [...rig.points.map((p) => p.y), ...rig.trusses.map((t) => t.y)];
  if (xs.length === 0) return <p className="muted">Nothing to draw yet: no points or trusses.</p>;
  const padX = 1.4;
  const padY = 1.2;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  const scale = W / (maxX - minX);
  const H = Math.max(220, (maxY - minY) * scale);
  const sx = (x: number) => (x - minX) * scale;
  // Plan Y grows upstage, the screen downwards.
  const sy = (y: number) => (maxY - y) * scale + (H - (maxY - minY) * scale) / 2;
  const resById = new Map(result.points.map((r) => [r.pointId, r]));
  const ring = Math.min(84, Math.max(40, 0.9 * scale));

  return (
    <div className="rig-plan" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Rig plan: trusses and points from above">
        {/* Centre line */}
        {minX < 0 && maxX > 0 && <line x1={sx(0)} y1={0} x2={sx(0)} y2={H} className="rig-centre" />}
        {rig.trusses.map((t) => {
          const x1 = sx(t.originX);
          const x2 = sx(t.originX + t.lengthM);
          const y = sy(t.y);
          const half = Math.max(4, 0.15 * scale);
          const selected = t.id === selectedTrussId;
          return (
            <g key={t.id} className={`rig-plan-truss${selected ? ' is-selected' : ''}`} onClick={() => onSelectTruss(t.id)} role="button" tabIndex={0} aria-label={`${t.name} truss`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectTruss(t.id)}>
              <rect x={x1} y={y - half - 6} width={x2 - x1} height={half * 2 + 12} className="rig-hit" />
              <line x1={x1} y1={y - half} x2={x2} y2={y - half} />
              <line x1={x1} y1={y + half} x2={x2} y2={y + half} />
              {Array.from({ length: Math.floor(t.lengthM) + 1 }, (_, i) => (
                <line key={i} x1={sx(t.originX + i)} y1={y - half} x2={sx(t.originX + i)} y2={y + half} className="rig-tick" />
              ))}
              <text x={x1 - 8} y={y + 5} className="rig-plan-label" textAnchor="end">
                {t.name}
              </text>
            </g>
          );
        })}
        {rig.points.map((p) => {
          const r = resById.get(p.id);
          if (!r) return null;
          const size = p.kind === 'cablePick' ? ring * 0.72 : ring;
          const cx = sx(p.x);
          const cy = sy(p.y);
          const selected = p.id === selectedPointId;
          return (
            <g key={p.id} className={`rig-plan-point${selected ? ' is-selected' : ''}`} onClick={() => onSelectPoint(p.id)} role="button" tabIndex={0} aria-label={`${r.name}: ${kg(r.pointLoadKg)}, ${STATE_LABEL[r.state]}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPoint(p.id)}>
              <circle cx={cx} cy={cy} r={size / 2} className="rig-hit" />
              {selected && <circle cx={cx} cy={cy} r={size / 2 + 4} className="rig-plan-halo" />}
              <RingGauge r={r} settings={rig.settings} size={size} compact x={cx - size / 2} y={cy - size / 2} />
              <text x={cx} y={cy + size / 2 + 16} className="rig-plan-name" textAnchor="middle">
                {r.name}
                {r.utilisation !== null ? ` ${pct(r.utilisation)}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Elevation of one truss: venue steel along the top, hoists with a pill carrying their load,
 * the truss with its fixtures underneath (drag them along, or use the arrow keys), and a
 * dimension line showing the spans and cantilevers.
 */
export function ElevationView({
  truss,
  rig,
  result,
  selectedPointId,
  onSelectPoint,
  onMoveFixture,
  onMoveEnd,
  readOnly,
}: {
  truss: RigTruss;
  rig: Rig;
  result: RigResult;
  selectedPointId?: string | null;
  onSelectPoint?: (id: string) => void;
  onMoveFixture?: (fixtureId: string, x: number) => void;
  onMoveEnd?: () => void;
  readOnly?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const W = 1000;
  const pad = 60;
  const scale = (W - pad * 2) / Math.max(truss.lengthM, 1);
  const sx = (x: number) => pad + x * scale;
  const resById = new Map(result.points.map((r) => [r.pointId, r]));
  const pointById = new Map(rig.points.map((p) => [p.id, p]));
  const hoists = [...truss.hoists].sort((a, b) => a.x - b.x);
  const fixtures = truss.loads.filter((l): l is Extract<typeof l, { kind: 'point' }> => l.kind === 'point' && l.source === 'fixture');
  const STEEL = 24;
  const TOP = 150;
  const CH = 26;
  const pillW = 128;
  const H = 300;

  const toTrussX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return 0;
    const pt = new DOMPoint(clientX, 0).matrixTransform(ctm.inverse());
    return Math.round(Math.max(0, Math.min(truss.lengthM, (pt.x - pad) / scale)) * 20) / 20;
  };

  // Stagger labels so neighbouring fixtures don't print on top of each other.
  const sortedFx = [...fixtures].sort((a, b) => a.x - b.x);
  const row = new Map(sortedFx.map((f, i) => [f.ref ?? f.label, i % 2]));
  const LABEL_W = 110;
  const roomy = new Map(
    sortedFx.map((f, i) => {
      // Same-row neighbours are two apart once staggered.
      const gaps = [sortedFx[i - 2], sortedFx[i + 2]].filter(Boolean).map((n) => Math.abs(n!.x - f.x) * scale);
      return [f.ref ?? f.label, gaps.every((g) => g >= LABEL_W)];
    })
  );
  const shortLabel = (label: string) => label.match(/(\d+)\s*$/)?.[1] ?? label.slice(0, 6);

  const dims = [0, ...hoists.map((h) => h.x), truss.lengthM].filter((v, i, a) => i === 0 || v - a[i - 1] > 0.01);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="rig-elev" role="group" aria-label={`${truss.name} elevation`}>
      <line x1={pad - 20} y1={STEEL} x2={W - pad + 20} y2={STEEL} className="rig-steel" />
      {hoists.map((h) => {
        const r = resById.get(h.pointId);
        const p = pointById.get(h.pointId);
        if (!r || !p) return null;
        const x = sx(h.x);
        const fill = r.utilisation === null ? 0 : Math.min(1, r.utilisation);
        const selected = h.pointId === selectedPointId;
        return (
          <g key={h.pointId} className={`rig-hoist is-${r.state}${selected ? ' is-selected' : ''}`} onClick={() => onSelectPoint?.(h.pointId)} role="button" tabIndex={0} aria-label={`${r.name}: ${kg(r.pointLoadKg)}, ${STATE_LABEL[r.state]}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPoint?.(h.pointId)}>
            <line x1={x} y1={STEEL} x2={x} y2={TOP} className="rig-chain" />
            <rect x={x - 9} y={TOP - 46} width={18} height={22} rx={3} className="rig-hoist-body" />
            <rect x={x - pillW / 2} y={STEEL + 10} width={pillW} height={56} rx={10} className="rig-pill" />
            <text x={x} y={STEEL + 28} textAnchor="middle" className="rig-pill-name">
              {r.name}
            </text>
            <text x={x} y={STEEL + 46} textAnchor="middle" className="rig-pill-kg">
              {Math.round(r.pointLoadKg)} kg {r.utilisation !== null ? `· ${pct(r.utilisation)}` : ''}
            </text>
            <rect x={x - pillW / 2 + 12} y={STEEL + 53} width={pillW - 24} height={5} rx={2.5} className="rig-pill-track" />
            <rect x={x - pillW / 2 + 12} y={STEEL + 53} width={(pillW - 24) * fill} height={5} rx={2.5} className="rig-pill-fill" />
          </g>
        );
      })}
      {/* The truss: two chords with lacing. */}
      <g className="rig-truss">
        <line x1={sx(0)} y1={TOP} x2={sx(truss.lengthM)} y2={TOP} />
        <line x1={sx(0)} y1={TOP + CH} x2={sx(truss.lengthM)} y2={TOP + CH} />
        <line x1={sx(0)} y1={TOP} x2={sx(0)} y2={TOP + CH} />
        <line x1={sx(truss.lengthM)} y1={TOP} x2={sx(truss.lengthM)} y2={TOP + CH} />
        <polyline
          className="rig-lacing"
          points={Array.from({ length: Math.ceil(truss.lengthM / 0.5) + 1 }, (_, i) => `${sx(Math.min(truss.lengthM, i * 0.5))},${i % 2 ? TOP + CH : TOP}`).join(' ')}
        />
      </g>
      {fixtures.map((f) => {
        const x = sx(f.x);
        const lr = row.get(f.ref ?? f.label) ?? 0;
        return (
          <g
            key={f.ref ?? f.label}
            className={`rig-fixture${readOnly ? '' : ' is-draggable'}`}
            tabIndex={readOnly ? -1 : 0}
            role={readOnly ? undefined : 'slider'}
            aria-label={`${f.label}, ${f.kg} kg`}
            aria-valuemin={0}
            aria-valuemax={truss.lengthM}
            aria-valuenow={f.x}
            aria-valuetext={`${f.x.toFixed(2)} m along the truss`}
            onPointerDown={(e) => {
              if (readOnly || !f.ref) return;
              dragging.current = f.ref;
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (dragging.current && dragging.current === f.ref) onMoveFixture?.(f.ref, toTrussX(e.clientX));
            }}
            onPointerUp={() => {
              if (dragging.current) onMoveEnd?.();
              dragging.current = null;
            }}
            onKeyDown={(e) => {
              if (readOnly || !f.ref) return;
              const step = e.shiftKey ? 0.5 : 0.05;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                onMoveFixture?.(f.ref, Math.max(0, Math.min(truss.lengthM, Math.round((f.x + (e.key === 'ArrowLeft' ? -step : step)) * 100) / 100)));
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onMoveEnd?.();
            }}
          >
            <line x1={x} y1={TOP + CH} x2={x} y2={TOP + CH + 10} className="rig-clamp" />
            <rect x={x - 11} y={TOP + CH + 10} width={22} height={28} rx={4} />
            <title>{`${f.label}: ${f.kg} kg at ${f.x.toFixed(2)} m`}</title>
            <text x={x} y={TOP + CH + 56 + lr * 16} textAnchor="middle" className="rig-fixture-label">
              {roomy.get(f.ref ?? f.label) ? f.label : shortLabel(f.label)}
            </text>
          </g>
        );
      })}
      {/* Dimension line: cantilevers and spans. */}
      <g className="rig-dims">
        <line x1={sx(0)} y1={H - 22} x2={sx(truss.lengthM)} y2={H - 22} />
        {dims.map((d, i) => (
          <line key={i} x1={sx(d)} y1={H - 30} x2={sx(d)} y2={H - 14} />
        ))}
        {dims.slice(1).map((d, i) => (
          <text key={i} x={(sx(dims[i]) + sx(d)) / 2} y={H - 28} textAnchor="middle">
            {(d - dims[i]).toFixed(2).replace(/\.?0+$/, '')} m
          </text>
        ))}
      </g>
    </svg>
  );
}

/** One point's row in the elevation legend: used by the print view. */
export function pointLine(r: PointResult) {
  return `${r.name}: ${kg(r.pointLoadKg)}${r.capacityKg ? ` of ${kg(r.capacityKg)} (${pct(r.utilisation)})` : ''}, ${STATE_LABEL[r.state]}`;
}
