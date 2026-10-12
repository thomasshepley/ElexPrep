import { PDFDocument, PDFImage, StandardFonts, rgb } from 'pdf-lib';
import {
  DMX_CABLE_WIDTH_FACTOR,
  LabelTypeTemplate,
  labelItemLocation,
  resolveLabelContent,
  LocationColorMap,
  ResolvedLocationColor,
  resolveLocationColor,
  contrastingTextIsWhite,
} from '@elexprep/shared';
import { CellRectPt, centerText, drawCellOutline, drawImageCover, drawLocationFill, fitTextToWidth, inPt, renderSheets } from './pdfBuilder';

async function fonts(doc: PDFDocument) {
  return {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  };
}

/**
 * Picks a legible text fill color for a resolved location color, plus an outline color when
 * the background is diagonal stripes - a flat fill alone can vanish against whichever stripe
 * happens to match it, so striped backgrounds get an outlined (fill + halo) text treatment.
 */
function textColorsFor(resolved: ResolvedLocationColor): { fill: ReturnType<typeof rgb>; outline?: ReturnType<typeof rgb> } {
  const isWhite = contrastingTextIsWhite(resolved.color);
  const fill = isWhite ? rgb(1, 1, 1) : rgb(0, 0, 0);
  if (resolved.pattern !== 'DIAGONAL_STRIPES') return { fill };
  return { fill, outline: isWhite ? rgb(0, 0, 0) : rgb(1, 1, 1) };
}

/**
 * Renders one label type's sheets from its declarative template: fill/image/text/stackedText
 * elements are walked in template order, scaled from the template's reference cell width to
 * each actual sheet cell (handles PAL's slightly-wider right column the same way the original
 * hand-written renderer did), and drawn with pdfBuilder's existing primitives - so this
 * produces pixel-identical output to the old per-type functions it replaces.
 */
export async function renderLabelTypeGeneric(
  doc: PDFDocument,
  template: LabelTypeTemplate,
  items: unknown[],
  locationColors: LocationColorMap = new Map(),
  logoImage?: PDFImage
): Promise<void> {
  const { bold, regular } = await fonts(doc);

  await renderSheets(doc, template.sheet, items, (page, cell, item) => {
    const scale = cell.wPt / inPt(template.referenceCellWidthIn);
    const content = resolveLabelContent(template.labelType, item);
    const location = labelItemLocation(item);

    for (const el of template.elements) {
      const elRect: CellRectPt = {
        xPt: cell.xPt + inPt(el.x) * scale,
        yPt: el.anchorBottom
          ? cell.yPt + inPt(el.y) * scale
          : cell.yPt + cell.hPt - inPt(el.y) * scale - inPt(el.h) * scale,
        wPt: inPt(el.w) * scale,
        hPt: inPt(el.h) * scale,
      };

      if (el.type === 'fill') {
        drawLocationFill(page, elRect, resolveLocationColor(locationColors, location));
        continue;
      }

      if (el.type === 'image') {
        drawCellOutline(page, elRect);
        if (logoImage) {
          drawImageCover(page, logoImage, elRect);
        } else {
          centerText(page, el.placeholder, regular, 10, elRect, elRect.hPt / 2 - inPt(0.05), rgb(0.6, 0.6, 0.6));
        }
        continue;
      }

      const font = el.font === 'bold' ? bold : regular;
      const { fill, outline } =
        el.color === 'byLocation' ? textColorsFor(resolveLocationColor(locationColors, location)) : { fill: rgb(0, 0, 0) };

      if (el.type === 'text') {
        const raw = el.text ?? (el.field ? content[el.field] : undefined);
        const text = typeof raw === 'string' ? raw : undefined;
        if (!text) continue;

        const isNarrow = Boolean(el.narrowCutLineWhenField && (item as Record<string, unknown>)[el.narrowCutLineWhenField]);
        const rect = isNarrow ? { ...elRect, wPt: elRect.wPt * DMX_CABLE_WIDTH_FACTOR } : elRect;
        const fit = el.fitToWidth
          ? fitTextToWidth(font, text, el.size, rect.wPt - inPt(el.fitMarginIn ?? 0), el.minSize ?? 14)
          : { text, size: el.size };
        const baselinePt = inPt(el.baselineOffsetIn) * scale + inPt(el.baselineFixedAdjustIn ?? 0);
        centerText(page, fit.text, font, fit.size, rect, baselinePt, fill, outline);

        if (isNarrow) {
          const cutX = elRect.xPt + elRect.wPt * DMX_CABLE_WIDTH_FACTOR;
          page.drawLine({
            start: { x: cutX, y: elRect.yPt },
            end: { x: cutX, y: elRect.yPt + elRect.hPt },
            thickness: 0.75,
            color: rgb(0.3, 0.3, 0.3),
            dashArray: [3, 3],
          });
        }
        continue;
      }

      // stackedText
      const raw = content[el.field];
      const lines = Array.isArray(raw) ? raw : [];
      lines.forEach((line, i) => {
        const baselineOffsetIn = el.firstBaselineOffsetIn - el.lineHeightIn * i;
        centerText(page, line, font, el.size, elRect, inPt(baselineOffsetIn) * scale, fill, outline);
      });
    }
  });
}
