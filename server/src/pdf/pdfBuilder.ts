import {
  Color,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from 'pdf-lib';
import { CellGeometry, SheetGeometry } from '@elexprep/shared';
import { hexToRgbFractions, ResolvedLocationColor } from './locationColors';

export const PT_PER_IN = 72;
export const inPt = (inches: number) => inches * PT_PER_IN;

export interface CellRectPt {
  xPt: number;
  yPt: number; // bottom-left origin, pdf-lib convention
  wPt: number;
  hPt: number;
}

/** Converts a top-left-origin, inches-based cell into pdf-lib's bottom-left points space. */
export function cellToPt(cell: CellGeometry, pageHeightIn: number): CellRectPt {
  return {
    xPt: inPt(cell.x),
    yPt: inPt(pageHeightIn - cell.y - cell.h),
    wPt: inPt(cell.w),
    hPt: inPt(cell.h),
  };
}

export function centerText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  cell: CellRectPt,
  yOffsetPt: number,
  color = rgb(0, 0, 0),
  outlineColor?: Color
) {
  const width = font.widthOfTextAtSize(text, size);
  const x = cell.xPt + cell.wPt / 2 - width / 2;
  const y = cell.yPt + yOffsetPt;
  // A striped background alternates two colors, so a single flat text color can vanish against
  // whichever stripe matches it — an outline (drawn as offset copies behind the real text)
  // keeps it legible against either stripe.
  if (outlineColor) {
    const offset = 1;
    for (const [dx, dy] of [
      [-offset, -offset],
      [0, -offset],
      [offset, -offset],
      [-offset, 0],
      [offset, 0],
      [-offset, offset],
      [0, offset],
      [offset, offset],
    ]) {
      page.drawText(text, { x: x + dx, y: y + dy, size, font, color: outlineColor });
    }
  }
  page.drawText(text, { x, y, size, font, color });
}

/**
 * Shrinks font size to fit `text` within `maxWidthPt` at `startSize`, down to `minSize`. If it
 * still doesn't fit at the minimum size (e.g. "Maverick Storm 1 Flex Hybrid"), trailing words
 * are dropped one at a time until what's left fits — so long fixture type names shorten to
 * something like "Maverick Storm 1" rather than overlapping or running off the label.
 */
export function fitTextToWidth(
  font: PDFFont,
  text: string,
  startSize: number,
  maxWidthPt: number,
  minSize = 14
): { text: string; size: number } {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidthPt) size -= 1;
  if (font.widthOfTextAtSize(text, size) <= maxWidthPt) return { text, size };

  const words = text.split(' ');
  while (words.length > 1) {
    words.pop();
    const candidate = words.join(' ');
    if (font.widthOfTextAtSize(candidate, size) <= maxWidthPt) return { text: candidate, size };
  }
  return { text: words[0] ?? text, size };
}

/**
 * Draws an image to completely cover a rect edge-to-edge (like CSS `object-fit: cover`):
 * scales up to fill both dimensions, preserving aspect ratio, and clips the overflow rather
 * than letterboxing — so a banner-style image slot never shows gaps on the sides regardless
 * of the source image's own aspect ratio.
 */
export function drawImageCover(page: PDFPage, image: PDFImage, rect: CellRectPt) {
  const scale = Math.max(rect.wPt / image.width, rect.hPt / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = rect.xPt - (drawWidth - rect.wPt) / 2;
  const y = rect.yPt - (drawHeight - rect.hPt) / 2;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(rect.xPt, rect.yPt, rect.wPt, rect.hPt),
    clip(),
    endPath()
  );
  page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  page.pushOperators(popGraphicsState());
}

/**
 * Fills a rect with a resolved location color — a plain solid fill, or classic 45-degree
 * hazard-tape stripes (e.g. red/white for Spare, yellow/black for Rigging) when the rule
 * says so.
 */
export function drawLocationFill(page: PDFPage, rect: CellRectPt, resolved: ResolvedLocationColor) {
  if (resolved.pattern === 'DIAGONAL_STRIPES' && resolved.secondaryColor) {
    drawDiagonalStripeFill(page, rect, resolved.color, resolved.secondaryColor);
    return;
  }
  const { r, g, b } = hexToRgbFractions(resolved.color);
  page.drawRectangle({ x: rect.xPt, y: rect.yPt, width: rect.wPt, height: rect.hPt, color: rgb(r, g, b) });
}

function drawDiagonalStripeFill(page: PDFPage, rect: CellRectPt, colorAHex: string, colorBHex: string) {
  const a = hexToRgbFractions(colorAHex);
  const b = hexToRgbFractions(colorBHex);
  page.drawRectangle({ x: rect.xPt, y: rect.yPt, width: rect.wPt, height: rect.hPt, color: rgb(a.r, a.g, a.b) });

  // Clip to the rect so the diagonal lines (drawn as thick 45-degree strokes) never bleed
  // past its edges, then lay color B stripes at a fixed period over the color A base.
  page.pushOperators(pushGraphicsState(), rectangle(rect.xPt, rect.yPt, rect.wPt, rect.hPt), clip(), endPath());
  const stripeWidth = inPt(0.14);
  const period = stripeWidth * 2;
  for (let offset = -rect.hPt - stripeWidth; offset <= rect.wPt + stripeWidth; offset += period) {
    const x0 = rect.xPt + offset;
    page.drawLine({
      start: { x: x0, y: rect.yPt },
      end: { x: x0 + rect.hPt, y: rect.yPt + rect.hPt },
      thickness: stripeWidth,
      color: rgb(b.r, b.g, b.b),
    });
  }
  page.pushOperators(popGraphicsState());
}

export function drawCellOutline(page: PDFPage, cell: CellRectPt) {
  page.drawRectangle({
    x: cell.xPt,
    y: cell.yPt,
    width: cell.wPt,
    height: cell.hPt,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.5,
    borderDashArray: [2, 2],
  });
}

/**
 * Paginates `items` across as many sheets as needed and hands each one, plus its
 * pdf-lib cell rectangle, to `drawItem` for rendering.
 */
export async function renderSheets<T>(
  doc: PDFDocument,
  geometry: SheetGeometry,
  items: T[],
  drawItem: (page: PDFPage, cellRect: CellRectPt, item: T, cellIndex: number) => void
) {
  const perSheet = geometry.cells.length;
  const pageWidthPt = inPt(geometry.pageWidthIn);
  const pageHeightPt = inPt(geometry.pageHeightIn);

  for (let offset = 0; offset < items.length; offset += perSheet) {
    const page = doc.addPage([pageWidthPt, pageHeightPt]);
    const chunk = items.slice(offset, offset + perSheet);
    chunk.forEach((item, i) => {
      const cell = geometry.cells[i];
      const rect = cellToPt(cell, geometry.pageHeightIn);
      drawCellOutline(page, rect);
      drawItem(page, rect, item, i);
    });
  }
}
