/**
 * Declarative label templates: each label type's physical layout (text positions, sizes,
 * fills) expressed as data instead of imperative pdf-lib draw calls. This is what the
 * per-job template override system (a future milestone) will edit - a `LabelTemplate` row
 * stores a partial, per-element-id patch on top of the DEFAULT_LABEL_TEMPLATES entry below,
 * merged by `mergeTemplate`.
 *
 * Geometry is inches, top-left origin, relative to a reference cell whose width is
 * `referenceCellWidthIn` on the template - matching the existing `CellGeometry` convention.
 * Where a sheet's cells vary slightly in width (PAL's left/right columns), the renderer
 * scales every element's x/y/w/h by the actual cell's width relative to that reference, the
 * same technique the original PAL renderer used for its own sub-regions.
 *
 * `baselineOffsetIn` mirrors the pdf-lib convention used throughout the original renderer:
 * inches up from the BOTTOM of the element's box to the text baseline (not a top-down offset)
 * - e.g. `cell.hPt - inPt(0.62)` in the old code is `baselineOffsetIn = H - 0.62`.
 */

import { LabelType } from './types';
import { CABLE_SHEET, FIXTURE_TRUSS_SPIKE_SHEET, PAL_SHEET, RACK_SHEET, SheetGeometry } from './labelGeometry';

export type LabelElementColor = 'byLocation' | 'black';

interface BaseElementDef {
  id: string;
  /** Inches, top-left origin, relative to the template's reference cell. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * One-off: PAL's content block is pinned to the bottom of the cell in the original
   * hand-written renderer (its sub-region's nominal y is never actually applied), which
   * matters because PAL's bottom-row cells are a fraction of an inch shorter than its top
   * row. `anchorBottom` reproduces that: `y` is measured up from the cell's bottom edge
   * instead of down from its top. Defaults to false (top-anchored, every other template).
   */
  anchorBottom?: boolean;
}

export interface FillElementDef extends BaseElementDef {
  type: 'fill';
  colorBy: 'location';
}

export interface ImageElementDef extends BaseElementDef {
  type: 'image';
  source: 'logo';
  /** Text shown in place of the image when the job has no logo uploaded. */
  placeholder: string;
}

export interface TextElementDef extends BaseElementDef {
  type: 'text';
  font: 'bold' | 'regular';
  size: number;
  minSize?: number;
  fitToWidth?: boolean;
  /** Total inches subtracted from `w` before fitting - margin the text must not touch. */
  fitMarginIn?: number;
  color: LabelElementColor;
  /** Inches up from the bottom of the element box to the text baseline - scales with the cell. */
  baselineOffsetIn: number;
  /**
   * A further baseline adjustment, in inches, applied AFTER scaling and never itself scaled -
   * reproduces the original PAL renderer's hand-written offsets, which mixed a proportional
   * term (e.g. half the region's height) with a flat physical nudge in the same expression.
   * Omit for every non-PAL template, where the sheet's cells are all the same size and this
   * has no effect either way.
   */
  baselineFixedAdjustIn?: number;
  /** Literal text, used as-is (e.g. "sACN Fixture"). Exactly one of `text`/`field` is set. */
  text?: string;
  /** Key into the per-item resolved content record (see resolveLabelContent) for dynamic text. */
  field?: string;
  /**
   * One-off: when the item's `field` is truthy, the element's width is scaled by
   * DMX_CABLE_WIDTH_FACTOR and a dashed cut line is drawn at the resulting right edge - the
   * narrow-strip + cut-line treatment unique to DMX cable labels. Deliberately a small,
   * explicit escape hatch rather than a generic conditional-geometry language.
   */
  narrowCutLineWhenField?: string;
}

export interface StackedTextElementDef extends BaseElementDef {
  type: 'stackedText';
  font: 'bold' | 'regular';
  size: number;
  /** Inches up from the bottom to the baseline of the FIRST rendered line. */
  firstBaselineOffsetIn: number;
  /** Inches between successive line baselines (lines render top-down). */
  lineHeightIn: number;
  color: LabelElementColor;
  /** Key into the resolved content record; value must be a string[] of already-filtered lines. */
  field: string;
}

export type LabelElementDef = FillElementDef | ImageElementDef | TextElementDef | StackedTextElementDef;

export interface LabelTypeTemplate {
  labelType: LabelType;
  sheet: SheetGeometry;
  /** Width (inches) of the cell these element coordinates were authored against. */
  referenceCellWidthIn: number;
  elements: LabelElementDef[];
}

function fixtureCellSize() {
  const cell = FIXTURE_TRUSS_SPIKE_SHEET.cells[0];
  return { w: cell.w, h: cell.h };
}

const FIXTURE_CELL = fixtureCellSize();
const CABLE_CELL = CABLE_SHEET.cells[0];
const RACK_CELL = RACK_SHEET.cells[0];

export const DEFAULT_LABEL_TEMPLATES: Record<LabelType, LabelTypeTemplate> = {
  FIXTURE: {
    labelType: 'FIXTURE',
    sheet: FIXTURE_TRUSS_SPIKE_SHEET,
    referenceCellWidthIn: FIXTURE_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: FIXTURE_CELL.w, h: FIXTURE_CELL.h },
      {
        id: 'address',
        type: 'text',
        field: 'address',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'bold',
        size: 34,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h - 0.62,
      },
      {
        id: 'infoLines',
        type: 'stackedText',
        field: 'infoLines',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'regular',
        size: 11,
        color: 'byLocation',
        firstBaselineOffsetIn: FIXTURE_CELL.h - 1.02,
        lineHeightIn: 0.24,
      },
    ],
  },

  TRUSS_SPIKE_POSITION: {
    labelType: 'TRUSS_SPIKE_POSITION',
    sheet: FIXTURE_TRUSS_SPIKE_SHEET,
    referenceCellWidthIn: FIXTURE_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: FIXTURE_CELL.w, h: FIXTURE_CELL.h },
      {
        id: 'address',
        type: 'text',
        field: 'address',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'bold',
        size: 54,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h / 2 - 0.18,
      },
    ],
  },

  TRUSS_SPIKE_TIP: {
    labelType: 'TRUSS_SPIKE_TIP',
    sheet: FIXTURE_TRUSS_SPIKE_SHEET,
    referenceCellWidthIn: FIXTURE_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: FIXTURE_CELL.w, h: FIXTURE_CELL.h },
      {
        id: 'text',
        type: 'text',
        field: 'text',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'bold',
        size: 22,
        fitToWidth: true,
        fitMarginIn: 0.3,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h / 2 - 0.12,
      },
    ],
  },

  TRUSS_SPIKE_SACN: {
    labelType: 'TRUSS_SPIKE_SACN',
    sheet: FIXTURE_TRUSS_SPIKE_SHEET,
    referenceCellWidthIn: FIXTURE_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: FIXTURE_CELL.w, h: FIXTURE_CELL.h },
      {
        id: 'title',
        type: 'text',
        text: 'sACN Fixture',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'bold',
        size: 16,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h - 0.5,
      },
      {
        id: 'ip',
        type: 'text',
        field: 'ipLine',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'regular',
        size: 12,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h / 2 - 0.05,
      },
      {
        id: 'subnet',
        type: 'text',
        field: 'subnetLine',
        x: 0,
        y: 0,
        w: FIXTURE_CELL.w,
        h: FIXTURE_CELL.h,
        font: 'regular',
        size: 12,
        color: 'byLocation',
        baselineOffsetIn: FIXTURE_CELL.h / 2 - 0.3,
      },
    ],
  },

  CABLE: {
    labelType: 'CABLE',
    sheet: CABLE_SHEET,
    referenceCellWidthIn: CABLE_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: CABLE_CELL.w, h: CABLE_CELL.h },
      {
        id: 'text',
        type: 'text',
        field: 'text',
        x: 0,
        y: 0,
        w: CABLE_CELL.w,
        h: CABLE_CELL.h,
        font: 'bold',
        size: 26,
        fitToWidth: true,
        fitMarginIn: 0.2,
        color: 'byLocation',
        baselineOffsetIn: CABLE_CELL.h / 2 - 0.12,
        narrowCutLineWhenField: 'isDmx',
      },
    ],
  },

  PAL: {
    labelType: 'PAL',
    sheet: PAL_SHEET,
    referenceCellWidthIn: PAL_SHEET.cells[0].w,
    elements: [
      {
        id: 'logo',
        type: 'image',
        source: 'logo',
        placeholder: 'LOGO',
        x: 0,
        y: 0,
        w: 5.3,
        h: 0.7,
      },
      { id: 'bar', type: 'fill', colorBy: 'location', x: 0, y: 0.72, w: 5.3, h: 0.67 },
      {
        id: 'barText',
        type: 'text',
        field: 'location',
        x: 0,
        y: 0.72,
        w: 5.3,
        h: 0.67,
        font: 'bold',
        size: 20,
        color: 'byLocation',
        baselineOffsetIn: 0.67 / 2,
        baselineFixedAdjustIn: -0.11,
      },
      {
        id: 'title',
        type: 'text',
        field: 'title',
        x: 0,
        y: 0,
        w: 5.3,
        h: 2.12,
        anchorBottom: true,
        font: 'bold',
        size: 30,
        fitToWidth: true,
        fitMarginIn: 0.3,
        color: 'black',
        baselineOffsetIn: 2.12,
        baselineFixedAdjustIn: -0.55,
      },
      {
        id: 'subtitle',
        type: 'text',
        field: 'subtitle',
        x: 0,
        y: 0,
        w: 5.3,
        h: 2.12,
        anchorBottom: true,
        font: 'bold',
        size: 30,
        fitToWidth: true,
        fitMarginIn: 0.3,
        color: 'black',
        baselineOffsetIn: 2.12,
        baselineFixedAdjustIn: -1.15,
      },
    ],
  },

  RACK: {
    labelType: 'RACK',
    sheet: RACK_SHEET,
    referenceCellWidthIn: RACK_CELL.w,
    elements: [
      { id: 'fill', type: 'fill', colorBy: 'location', x: 0, y: 0, w: RACK_CELL.w, h: RACK_CELL.h },
      {
        id: 'title',
        type: 'text',
        field: 'title',
        x: 0,
        y: 0,
        w: RACK_CELL.w,
        h: RACK_CELL.h,
        font: 'bold',
        size: 22,
        fitToWidth: true,
        fitMarginIn: 0.3,
        color: 'byLocation',
        baselineOffsetIn: RACK_CELL.h / 2 + 0.15,
      },
      {
        id: 'subtitle',
        type: 'text',
        field: 'subtitle',
        x: 0,
        y: 0,
        w: RACK_CELL.w,
        h: RACK_CELL.h,
        font: 'regular',
        size: 13,
        fitToWidth: true,
        fitMarginIn: 0.3,
        color: 'byLocation',
        baselineOffsetIn: RACK_CELL.h / 2 - 0.25,
      },
    ],
  },
};

/**
 * Applies a per-job, per-element partial override on top of a default template. Only the
 * geometry/style fields present in `overrides` are replaced; an element with no override
 * entry (including a brand-new default element added in a later release) passes through
 * untouched - so a job customized before a new element existed still picks it up.
 */
export function mergeTemplate(
  base: LabelTypeTemplate,
  overrides: Record<string, Partial<LabelElementDef>> | null | undefined
): LabelTypeTemplate {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return {
    ...base,
    elements: base.elements.map((el) => {
      const patch = overrides[el.id];
      return patch ? ({ ...el, ...patch } as LabelElementDef) : el;
    }),
  };
}

// ---------------------------------------------------------------------------
// Content resolvers: pure functions mapping a label's raw content object to the field values
// its template's elements reference. Kept separate from the templates themselves since the
// conditional stacking logic (e.g. Fixture's Main/Pix/Mode lines) is genuine business logic,
// not something a future template-geometry editor needs to touch.
// ---------------------------------------------------------------------------

export interface FixtureLabelContent {
  address: number;
  mainUniverse?: number | null;
  mainAddress?: number | null;
  pixUniverse?: number | null;
  pixAddress?: number | null;
  mode?: string | null;
  location?: string | null;
}

export interface TrussSpikePositionContent {
  address: number;
  location?: string | null;
}

export interface TrussSpikeTipContent {
  text?: string;
  location?: string | null;
}

export interface TrussSpikeSacnContent {
  ipAddress: string;
  subnetMask?: string;
  location?: string | null;
}

export interface CableLabelContent {
  text: string;
  isDmx?: boolean;
  location?: string | null;
}

export interface PalLabelContent {
  location?: string;
  title: string;
  subtitle?: string;
}

export interface RackLabelContent {
  title: string;
  subtitle?: string;
  location?: string | null;
}

export type LabelContentValue = string | string[] | undefined;

export function resolveLabelContent(labelType: LabelType, item: unknown): Record<string, LabelContentValue> {
  switch (labelType) {
    case 'FIXTURE': {
      const c = item as FixtureLabelContent;
      const infoLines: string[] = [];
      if (c.mainUniverse != null && c.mainAddress != null) {
        infoLines.push(`Main: Uni: ${c.mainUniverse} Add: ${c.mainAddress}`);
      }
      if (c.pixUniverse != null && c.pixAddress != null) {
        infoLines.push(`Pix: Uni: ${c.pixUniverse} Add: ${c.pixAddress}`);
      }
      if (c.mode) infoLines.push(`Mode: ${c.mode}`);
      return { address: String(c.address), infoLines };
    }
    case 'TRUSS_SPIKE_POSITION': {
      const c = item as TrussSpikePositionContent;
      return { address: String(c.address) };
    }
    case 'TRUSS_SPIKE_TIP': {
      const c = item as TrussSpikeTipContent;
      return { text: c.text ?? 'DO NOT TIP' };
    }
    case 'TRUSS_SPIKE_SACN': {
      const c = item as TrussSpikeSacnContent;
      return {
        ipLine: `IP Address: ${c.ipAddress}`,
        subnetLine: `Subnet Mask: ${c.subnetMask ?? '255.0.0.0'}`,
      };
    }
    case 'CABLE': {
      const c = item as CableLabelContent;
      return { text: c.text };
    }
    case 'PAL': {
      const c = item as PalLabelContent;
      return { location: c.location ?? '', title: c.title, subtitle: c.subtitle };
    }
    case 'RACK': {
      const c = item as RackLabelContent;
      return { title: c.title, subtitle: c.subtitle };
    }
    default:
      return {};
  }
}

/** Reads the `location` field any label content type carries, for fill/text color resolution. */
export function labelItemLocation(item: unknown): string | null | undefined {
  return (item as { location?: string | null }).location;
}
