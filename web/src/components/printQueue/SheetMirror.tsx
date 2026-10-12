import { useRef, useState } from 'react';
import type { LabelElementColor, LabelElementDef, LabelTypeTemplate, LocationColorMap } from '@elexprep/shared';
import { DMX_CABLE_WIDTH_FACTOR, contrastingTextIsWhite, labelItemLocation, resolveLabelContent, resolveLocationColor } from '@elexprep/shared';

/**
 * CSS px per authored inch. The mirror approximates text layout with simple centered flexbox
 * boxes rather than reproducing pdf-lib's baseline math - exact pixel fidelity already lives
 * in the real PDF (verified separately via the preview/download actions); this view only needs
 * to be faithful enough to make positioning and sizing decisions on.
 */
export const PX_PER_IN = 90;
const PX_PER_PT = PX_PER_IN / 72;

function fillStyle(resolved: ReturnType<typeof resolveLocationColor>): React.CSSProperties {
  if (resolved.pattern === 'DIAGONAL_STRIPES' && resolved.secondaryColor) {
    return {
      backgroundImage: `repeating-linear-gradient(45deg, ${resolved.color} 0 10px, ${resolved.secondaryColor} 10px 20px)`,
    };
  }
  return { backgroundColor: resolved.color };
}

function textColor(el: { color: LabelElementColor }, resolved: ReturnType<typeof resolveLocationColor>): string {
  if (el.color !== 'byLocation') return '#000';
  return contrastingTextIsWhite(resolved.color) ? '#fff' : '#000';
}

export interface LogoUrls {
  left?: string;
  middle?: string;
  right?: string;
}

export interface SheetMirrorProps {
  template: LabelTypeTemplate;
  item: unknown;
  locationColors: LocationColorMap;
  logoUrls?: LogoUrls;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChangeElement?: (id: string, patch: Partial<Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h'>>) => void;
}

/** Renders one representative cell of a label type's template - a live HTML/CSS mirror of what buildLabelPdfs.ts will actually print, used both as a read-only preview and, in edit mode, as the surface for dragging/resizing elements. */
export default function SheetMirror({
  template,
  item,
  locationColors,
  logoUrls,
  editable = false,
  selectedId,
  onSelect,
  onChangeElement,
}: SheetMirrorProps) {
  const cell = template.sheet.cells[0];
  const content = resolveLabelContent(template.labelType, item);
  const location = labelItemLocation(item);
  const resolved = resolveLocationColor(locationColors, location);
  const dragRef = useRef<{
    id: string;
    kind: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    startEl: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !onChangeElement) return;
    const dxIn = (e.clientX - drag.startClientX) / PX_PER_IN;
    const dyIn = (e.clientY - drag.startClientY) / PX_PER_IN;
    if (drag.kind === 'move') {
      onChangeElement(drag.id, {
        x: Math.round((drag.startEl.x + dxIn) * 100) / 100,
        y: Math.round((drag.startEl.y + dyIn) * 100) / 100,
      });
    } else {
      onChangeElement(drag.id, {
        w: Math.max(0.1, Math.round((drag.startEl.w + dxIn) * 100) / 100),
        h: Math.max(0.1, Math.round((drag.startEl.h + dyIn) * 100) / 100),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  };

  const beginDrag = (el: LabelElementDef, kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(el.id);
    dragRef.current = {
      id: el.id,
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startEl: { x: el.x, y: el.y, w: el.w, h: el.h },
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: cell.w * PX_PER_IN,
        height: cell.h * PX_PER_IN,
        background: '#fff',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}
      onPointerDown={() => editable && onSelect?.(null)}
    >
      {template.elements.map((el) => {
        const top = el.anchorBottom ? (cell.h - el.y - el.h) * PX_PER_IN : el.y * PX_PER_IN;
        const isNarrow = el.type === 'text' && Boolean(el.narrowCutLineWhenField && (item as Record<string, unknown>)?.[el.narrowCutLineWhenField]);
        const width = (isNarrow ? el.w * DMX_CABLE_WIDTH_FACTOR : el.w) * PX_PER_IN;
        const boxStyle: React.CSSProperties = {
          position: 'absolute',
          left: el.x * PX_PER_IN,
          top,
          width,
          height: el.h * PX_PER_IN,
          outline: editable && selectedId === el.id ? '2px solid var(--accent)' : editable ? '1px dashed transparent' : undefined,
          cursor: editable ? 'move' : undefined,
        };

        if (el.type === 'fill') {
          return <div key={el.id} style={{ ...boxStyle, ...fillStyle(resolved) }} onPointerDown={beginDrag(el, 'move')} />;
        }

        if (el.type === 'image') {
          const urls = [logoUrls?.left, logoUrls?.middle, logoUrls?.right].filter((u): u is string => Boolean(u));
          return (
            <div
              key={el.id}
              style={{ ...boxStyle, border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onPointerDown={beginDrag(el, 'move')}
            >
              {urls.length > 0 ? (
                urls.map((u, i) => (
                  <div key={i} style={{ flex: 1, height: '100%', minWidth: 0 }}>
                    <LogoImg src={u} placeholder={el.placeholder} />
                  </div>
                ))
              ) : (
                <span style={{ color: '#999', fontSize: 11 }}>{el.placeholder}</span>
              )}
              {editable && selectedId === el.id && <ResizeHandle onPointerDown={beginDrag(el, 'resize')} />}
            </div>
          );
        }

        if (el.type === 'text') {
          const raw = el.text ?? (el.field ? content[el.field] : undefined);
          const text = typeof raw === 'string' ? raw : '';
          const baselineBottomPx = (el.baselineOffsetIn + (el.baselineFixedAdjustIn ?? 0)) * PX_PER_IN;
          return (
            <div
              key={el.id}
              style={{
                ...boxStyle,
                borderRight: isNarrow ? '2px dashed #555' : undefined,
              }}
              onPointerDown={beginDrag(el, 'move')}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: Math.max(0, baselineBottomPx - el.size * PX_PER_PT * 0.3),
                  fontWeight: el.font === 'bold' ? 700 : 400,
                  fontSize: el.size * PX_PER_PT,
                  color: textColor(el, resolved),
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  padding: '0 2px',
                }}
              >
                {text}
              </span>
              {editable && selectedId === el.id && <ResizeHandle onPointerDown={beginDrag(el, 'resize')} />}
            </div>
          );
        }

        // stackedText: each line's own baseline, positioned top-down from firstBaselineOffsetIn.
        const raw = content[el.field];
        const lines = Array.isArray(raw) ? raw : [];
        return (
          <div key={el.id} style={boxStyle} onPointerDown={beginDrag(el, 'move')}>
            {lines.map((line, i) => {
              const baselineBottomPx = (el.firstBaselineOffsetIn - el.lineHeightIn * i) * PX_PER_IN;
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: Math.max(0, baselineBottomPx - el.size * PX_PER_PT * 0.3),
                    fontWeight: el.font === 'bold' ? 700 : 400,
                    fontSize: el.size * PX_PER_PT,
                    color: textColor(el, resolved),
                    textAlign: 'center',
                  }}
                >
                  {line}
                </span>
              );
            })}
            {editable && selectedId === el.id && <ResizeHandle onPointerDown={beginDrag(el, 'resize')} />}
          </div>
        );
      })}
    </div>
  );
}

function LogoImg({ src, placeholder }: { src: string; placeholder: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ color: '#999', fontSize: 11 }}>{placeholder}</span>;
  return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setFailed(true)} />;
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        right: -4,
        bottom: -4,
        width: 10,
        height: 10,
        borderRadius: 2,
        background: 'var(--accent)',
        cursor: 'nwse-resize',
      }}
    />
  );
}
