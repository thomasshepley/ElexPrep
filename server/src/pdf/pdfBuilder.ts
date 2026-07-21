import {
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
  color = rgb(0, 0, 0)
) {
  const width = font.widthOfTextAtSize(text, size);
  const x = cell.xPt + cell.wPt / 2 - width / 2;
  const y = cell.yPt + yOffsetPt;
  page.drawText(text, { x, y, size, font, color });
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
