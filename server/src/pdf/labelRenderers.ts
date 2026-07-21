import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  CABLE_SHEET,
  DMX_CABLE_WIDTH_FACTOR,
  GRID_18_SHEET,
  PAL_CELL_LAYOUT,
  PAL_SHEET,
  RACK_SHEET,
} from '@elexprep/shared';
import { CellRectPt, centerText, drawCellOutline, drawImageCover, inPt, renderSheets } from './pdfBuilder';
import {
  contrastingTextIsWhite,
  hexToRgbFractions,
  LocationColorMap,
  resolveLocationColor,
} from './locationColors';

export interface FixtureLabelContent {
  address: number;
  mainUniverse?: number | null;
  mainAddress?: number | null;
  pixUniverse?: number | null;
  pixAddress?: number | null;
  mode?: string | null;
}

export interface TrussSpikePositionContent {
  address: number;
}

export interface TrussSpikeTipContent {
  text?: string;
}

export interface TrussSpikeSacnContent {
  ipAddress: string;
  subnetMask?: string;
}

export interface CableLabelContent {
  text: string;
  isDmx?: boolean;
}

export interface PalLabelContent {
  location?: string;
  title: string;
  subtitle?: string;
}

export interface RackLabelContent {
  title: string;
  subtitle?: string;
}

async function fonts(doc: PDFDocument) {
  return {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  };
}

export async function buildFixtureLabelsPdf(doc: PDFDocument, items: FixtureLabelContent[]) {
  const { bold, regular } = await fonts(doc);
  await renderSheets(doc, GRID_18_SHEET, items, (page, cell, item) => {
    centerText(page, String(item.address), bold, 34, cell, cell.hPt - inPt(0.62));
    let line = 1;
    const lineH = inPt(0.24);
    const topY = cell.hPt - inPt(0.78);
    if (item.mainUniverse != null && item.mainAddress != null) {
      centerText(page, `Main: Uni: ${item.mainUniverse} Add: ${item.mainAddress}`, regular, 11, cell, topY - lineH * line);
      line++;
    }
    if (item.pixUniverse != null && item.pixAddress != null) {
      centerText(page, `Pix: Uni: ${item.pixUniverse} Add: ${item.pixAddress}`, regular, 11, cell, topY - lineH * line);
      line++;
    }
    if (item.mode) {
      centerText(page, `Mode: ${item.mode}`, regular, 11, cell, topY - lineH * line);
    }
  });
}

export async function buildTrussSpikePositionPdf(doc: PDFDocument, items: TrussSpikePositionContent[]) {
  const { bold } = await fonts(doc);
  await renderSheets(doc, GRID_18_SHEET, items, (page, cell, item) => {
    centerText(page, String(item.address), bold, 54, cell, cell.hPt / 2 - inPt(0.18));
  });
}

export async function buildTrussSpikeTipPdf(doc: PDFDocument, items: TrussSpikeTipContent[]) {
  const { bold } = await fonts(doc);
  await renderSheets(doc, GRID_18_SHEET, items, (page, cell, item) => {
    const text = item.text ?? 'DO NOT TIP';
    centerText(page, text, bold, 22, cell, cell.hPt / 2 - inPt(0.12));
  });
}

export async function buildTrussSpikeSacnPdf(doc: PDFDocument, items: TrussSpikeSacnContent[]) {
  const { bold, regular } = await fonts(doc);
  await renderSheets(doc, GRID_18_SHEET, items, (page, cell, item) => {
    centerText(page, 'sACN Fixture', bold, 16, cell, cell.hPt - inPt(0.5));
    centerText(page, `IP Address: ${item.ipAddress}`, regular, 12, cell, cell.hPt / 2 - inPt(0.05));
    centerText(page, `Subnet Mask: ${item.subnetMask ?? '255.0.0.0'}`, regular, 12, cell, cell.hPt / 2 - inPt(0.3));
  });
}

/**
 * A DMX cable label is printed 1/3 narrower than a standard cable label: text is confined
 * to the left 2/3 of the strip and a dashed cut line marks where the blank 1/3 begins, so it
 * can be trimmed or folded back on itself.
 */
export async function buildCableLabelsPdf(doc: PDFDocument, items: CableLabelContent[]) {
  const { bold } = await fonts(doc);
  await renderSheets(doc, CABLE_SHEET, items, (page, cell, item) => {
    const usableWidthPt = item.isDmx ? cell.wPt * DMX_CABLE_WIDTH_FACTOR : cell.wPt;
    const textCell: CellRectPt = { ...cell, wPt: usableWidthPt };
    centerText(page, item.text, bold, 26, textCell, cell.hPt / 2 - inPt(0.12));
    if (item.isDmx) {
      const cutX = cell.xPt + usableWidthPt;
      page.drawLine({
        start: { x: cutX, y: cell.yPt },
        end: { x: cutX, y: cell.yPt + cell.hPt },
        thickness: 0.75,
        color: rgb(0.3, 0.3, 0.3),
        dashArray: [3, 3],
      });
    }
  });
}

function drawPalCell(
  page: PDFPage,
  cell: CellRectPt,
  item: PalLabelContent,
  bold: PDFFont,
  regular: PDFFont,
  locationColors: LocationColorMap,
  logoImage?: PDFImage
) {
  const scaleX = cell.wPt / inPt(PAL_SHEET.cells[0].w);

  const logo = PAL_CELL_LAYOUT.logo;
  const logoRect: CellRectPt = {
    xPt: cell.xPt + inPt(logo.x) * scaleX,
    yPt: cell.yPt + cell.hPt - inPt(logo.y) * scaleX - inPt(logo.h) * scaleX,
    wPt: inPt(logo.w) * scaleX,
    hPt: inPt(logo.h) * scaleX,
  };
  drawCellOutline(page, logoRect);
  if (logoImage) {
    // Cover-fit (not contain): the project image spans the full banner width edge to edge,
    // as per the PAL template, rather than being letterboxed with margins on either side.
    drawImageCover(page, logoImage, logoRect);
  } else {
    centerText(page, 'LOGO', regular, 10, logoRect, logoRect.hPt / 2 - inPt(0.05), rgb(0.6, 0.6, 0.6));
  }

  const bar = PAL_CELL_LAYOUT.locationBar;
  const barRect: CellRectPt = {
    xPt: cell.xPt,
    yPt: cell.yPt + cell.hPt - inPt(bar.y) * scaleX - inPt(bar.h) * scaleX,
    wPt: cell.wPt,
    hPt: inPt(bar.h) * scaleX,
  };
  const barColorHex = resolveLocationColor(locationColors, item.location);
  const { r, g, b } = hexToRgbFractions(barColorHex);
  const textColor = contrastingTextIsWhite(barColorHex) ? rgb(1, 1, 1) : rgb(0, 0, 0);
  page.drawRectangle({ x: barRect.xPt, y: barRect.yPt, width: barRect.wPt, height: barRect.hPt, color: rgb(r, g, b) });
  centerText(page, item.location ?? '', bold, 20, barRect, barRect.hPt / 2 - inPt(0.11), textColor);

  const content = PAL_CELL_LAYOUT.content;
  const contentRect: CellRectPt = {
    xPt: cell.xPt,
    yPt: cell.yPt,
    wPt: cell.wPt,
    hPt: inPt(content.h) * scaleX,
  };
  centerText(page, item.title, bold, 30, contentRect, contentRect.hPt - inPt(0.55));
  if (item.subtitle) {
    centerText(page, item.subtitle, bold, 30, contentRect, contentRect.hPt - inPt(1.15));
  }
}

export async function buildPalLabelsPdf(
  doc: PDFDocument,
  items: PalLabelContent[],
  logo?: { bytes: Uint8Array; kind: 'png' | 'jpg' },
  locationColors?: LocationColorMap
) {
  const { bold, regular } = await fonts(doc);
  const logoImage = logo ? await (logo.kind === 'png' ? doc.embedPng(logo.bytes) : doc.embedJpg(logo.bytes)) : undefined;
  const colors = locationColors ?? new Map();
  await renderSheets(doc, PAL_SHEET, items, (page, cell, item) => {
    drawPalCell(page, cell, item, bold, regular, colors, logoImage);
  });
}

export async function buildRackLabelsPdf(doc: PDFDocument, items: RackLabelContent[]) {
  const { bold, regular } = await fonts(doc);
  await renderSheets(doc, RACK_SHEET, items, (page, cell, item) => {
    centerText(page, item.title, bold, 22, cell, cell.hPt / 2 + inPt(0.15));
    if (item.subtitle) {
      centerText(page, item.subtitle, regular, 13, cell, cell.hPt / 2 - inPt(0.25));
    }
  });
}
