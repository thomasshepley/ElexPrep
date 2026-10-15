import { CurrentRmsConfig } from './config';

// Overridable so tests (and this repo's own verification run) can point at a local mock
// server instead of the real Current RMS API.
export const CURRENT_RMS_BASE_URL = process.env.CURRENT_RMS_BASE_URL ?? 'https://api.current-rms.com/api/v1';

export class CurrentRmsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Current RMS rate-limits to 60 requests/60s; this keeps a sync run comfortably under that. */
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function request(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  path: string,
  params: Record<string, string | number | undefined> = {},
  attempt = 1,
  write?: { method: 'POST' | 'PUT'; body: unknown }
): Promise<unknown> {
  if (!config.subdomain || !config.apiKey) {
    throw new CurrentRmsError('Current RMS is not configured (missing subdomain or API key)', 400);
  }
  await throttle();

  const url = new URL(`${CURRENT_RMS_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    method: write?.method ?? 'GET',
    headers: {
      'X-SUBDOMAIN': config.subdomain,
      'X-AUTH-TOKEN': config.apiKey,
      Accept: 'application/json',
      ...(write ? { 'Content-Type': 'application/json' } : {}),
    },
    body: write ? JSON.stringify(write.body) : undefined,
  });

  if (res.status === 429 && attempt <= 3) {
    // X-RateLimit-Reset is what Current RMS documents; Retry-After is the generic fallback.
    const retryAfterSec = Number(res.headers.get('retry-after')) || Number(res.headers.get('x-ratelimit-reset')) || 5 * attempt;
    await new Promise((r) => setTimeout(r, Math.min(retryAfterSec, 60) * 1000));
    return request(config, path, params, attempt + 1, write);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new CurrentRmsError('Current RMS rejected the subdomain/API key', res.status);
    }
    throw new CurrentRmsError(`Current RMS API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`, res.status);
  }

  return res.json();
}

export interface RawOpportunity {
  id: number;
  subject?: string;
  name?: string;
  // Verified against a real account: status/state are integer codes with the human label
  // in a sibling *_name field (e.g. status: 1, status_name: "Provisional").
  status?: number;
  status_name?: string;
  state?: number;
  state_name?: string;
  starts_at?: string;
  ends_at?: string;
  updated_at?: string;
  member_id?: number | null;
  // Not present on a real account's list/show response (only member_id is) - kept in case
  // a future API version or an `include`-style param ever embeds it.
  member?: { name?: string; business_name?: string } | null;
  // Current RMS's own "Project" id, grouping several opportunities together (verified against
  // a real account) - e.g. a job's main rental opportunity plus a separate crewing one.
  project_id?: number | null;
  [key: string]: unknown;
}

interface OpportunitiesPage {
  opportunities: RawOpportunity[];
  meta?: { total_count?: number; total_pages?: number };
}

export async function testCurrentRmsConnection(config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>) {
  await request(config, '/opportunities', { per_page: 1 });
}

// GET /opportunities' own documented cap is 25 (lower than the general 100/page rule
// elsewhere in the API - "this endpoint can return a lot of data"). Requesting more than the
// endpoint honors would silently truncate each page while our pagination-termination check
// (items.length < perPage) still compared against the larger requested value, so it would
// stop after the very first page and quietly miss anything beyond the first 25.
const OPPORTUNITIES_PER_PAGE = 25;

/** A single page of opportunities, most-recently-updated first. */
export async function fetchOpportunitiesPage(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  opts: { page: number; perPage?: number; updatedSince?: string }
): Promise<OpportunitiesPage> {
  const params: Record<string, string | number | undefined> = {
    page: opts.page,
    per_page: opts.perPage ?? OPPORTUNITIES_PER_PAGE,
    // Explicit rather than relying on whatever this endpoint defaults to when omitted - we
    // want every opportunity cached (including completed/cancelled ones still worth
    // browsing), not just whatever a narrower default filtermode would return.
    filtermode: 'all',
    // Current RMS uses Ransack-style sort params (q[s][]=field direction), not a bare `sort`.
    'q[s][]': 'updated_at desc',
  };
  if (opts.updatedSince) params['q[updated_at_gteq]'] = opts.updatedSince;
  const body = (await request(config, '/opportunities', params)) as OpportunitiesPage;
  return body;
}

const MAX_SYNC_PAGES = 100; // hard cap so a misbehaving API can't loop forever

/** Pulls every opportunity (or every one updated since `updatedSince`), page by page. */
export async function fetchAllOpportunities(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  opts: { updatedSince?: string; onPage?: (page: RawOpportunity[], pageNum: number) => void } = {}
): Promise<RawOpportunity[]> {
  const perPage = OPPORTUNITIES_PER_PAGE;
  const all: RawOpportunity[] = [];
  for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
    const result = await fetchOpportunitiesPage(config, { page, perPage, updatedSince: opts.updatedSince });
    const items = result.opportunities ?? [];
    all.push(...items);
    opts.onPage?.(items, page);
    const totalPages = result.meta?.total_pages;
    if (items.length < perPage || (totalPages !== undefined && page >= totalPages)) break;
  }
  return all;
}

export async function fetchOpportunity(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  rmsId: number
): Promise<RawOpportunity | null> {
  try {
    const body = (await request(config, `/opportunities/${rmsId}`)) as { opportunity?: RawOpportunity };
    return body.opportunity ?? null;
  } catch (err) {
    if (err instanceof CurrentRmsError && err.status === 404) return null;
    throw err;
  }
}

export interface RawMember {
  id: number;
  name?: string;
  business_name?: string;
  [key: string]: unknown;
}

/**
 * Looked up on demand (e.g. when importing an opportunity as a job) rather than during bulk
 * sync - the opportunities list only returns `member_id`, not an embedded record, and
 * resolving every one during a sync of hundreds of opportunities would burn through the
 * 60-req/60s rate limit for little benefit.
 */
export async function fetchMember(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  memberId: number
): Promise<RawMember | null> {
  try {
    const body = (await request(config, `/members/${memberId}`)) as { member?: RawMember };
    return body.member ?? null;
  } catch (err) {
    if (err instanceof CurrentRmsError && err.status === 404) return null;
    throw err;
  }
}

export interface RawOpportunityItem {
  id: number;
  opportunity_id?: number;
  item_id?: number;
  item_type?: string;
  name?: string;
  product_name?: string;
  description?: string;
  quantity?: number;
  // Current RMS's own line-item status (e.g. 5 = "Reserved") - informational only; ElexPrep
  // tracks its own crew-facing prepped/pulled checkbox independently of this (see signage).
  status?: number;
  status_name?: string;
  // 0 = Group (a section heading, e.g. "Lighting - Moving Lights" - not a pickable item),
  // 1 = Principal, 2 = Accessory. Per Current RMS's own API reference.
  opportunity_item_type?: number;
  opportunity_item_type_name?: string;
  // 1 = Rental, 2 = Sale, 3 = Service. Per Current RMS's own API reference - used by the pick
  // list UI to default to showing only Rental items (Service entries are typically labour/setup
  // line items, not physical kit to prep).
  transaction_type?: number;
  transaction_type_name?: string;
  // Verified against a real account: money fields come back as decimal strings (e.g. "6300.0"),
  // not numbers. charge_excluding_tax_total is what's actually billed for this line (quantity x
  // rate x chargeable days, pre-tax) - used by the admin-only crew margin view to total what a
  // Service (labour) line charges the client, separate entirely from Current RMS's own per-
  // asset `opportunity_cost` (what's paid out), which this app doesn't read - margin is
  // computed against ElexPrep's own crew pay rates instead (see routes/currentRms.ts).
  charge_excluding_tax_total?: string;
  charge_total?: string;
  /** Only present when fetched with include[]=item_assets. */
  item_assets?: RawItemAsset[];
  [key: string]: unknown;
}

/** One unit (or a bulk quantity) of stock allocated to an opportunity item. */
export interface RawItemAsset {
  id: number;
  opportunity_item_id?: number;
  stock_level_id?: number;
  stock_level_asset_number?: string;
  /** 10 Allocated, 15 Prepared, 20 Booked Out, 30 Checked In (per Current RMS's API reference). */
  status?: number;
  status_name?: string;
  quantity?: string | number;
  container?: string;
}

/** Item-asset status code for "Prepared". */
export const ITEM_ASSET_PREPARED = 15;

/** Current RMS's own opportunity_item_type code for a section-heading row, not a real item. */
export const GROUP_ITEM_TYPE = 0;

interface OpportunityItemsPage {
  opportunity_items?: RawOpportunityItem[];
  meta?: { total_count?: number; total_pages?: number };
}

const MAX_ITEM_PAGES = 20; // hard cap so a misbehaving API can't loop forever

/**
 * Line items for an opportunity - Current RMS calls these "opportunity items". Per Current
 * RMS's own API reference, these are nested under the opportunity rather than a flat
 * filterable collection: GET /opportunities/{opportunity_id}/opportunity_items, paginated at
 * up to 100 per page like the rest of the API.
 */
export async function fetchOpportunityItems(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  rmsId: number,
  opts: { withAssets?: boolean } = {}
): Promise<RawOpportunityItem[]> {
  const perPage = 100;
  const all: RawOpportunityItem[] = [];
  for (let page = 1; page <= MAX_ITEM_PAGES; page++) {
    const body = (await request(config, `/opportunities/${rmsId}/opportunity_items`, {
      page,
      per_page: perPage,
      // The units allocated to each line (asset numbers and their prepared/booked-out state),
      // in the same request rather than one extra call per line.
      ...(opts.withAssets ? { 'include[]': 'item_assets' } : {}),
    })) as OpportunityItemsPage;
    const items = body.opportunity_items ?? [];
    all.push(...items);
    const totalPages = body.meta?.total_pages;
    if (items.length < perPage || (totalPages !== undefined && page >= totalPages)) break;
  }
  return all;
}

export interface RawStockLevel {
  id: number;
  item_id?: number;
  item_name?: string;
  asset_number?: string;
  /** 50 = Bulk Stock in the documented example; serialised stock carries its own asset number. */
  stock_category?: number;
  stock_category_name?: string;
  [key: string]: unknown;
}

/** The stock level whose asset (barcode) number is exactly `code`, if Current RMS has one. */
export async function findStockLevelByAssetNumber(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  code: string
): Promise<RawStockLevel | null> {
  const body = (await request(config, '/stock_levels', { 'q[asset_number_eq]': code, per_page: 1 })) as { stock_levels?: RawStockLevel[] };
  return body.stock_levels?.[0] ?? null;
}

export interface RawProduct {
  id: number;
  name?: string;
  barcode?: string;
  [key: string]: unknown;
}

/** A bulk or non-stock product whose product barcode is exactly `code`. */
export async function findProductByBarcode(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  code: string
): Promise<RawProduct | null> {
  const body = (await request(config, '/products', { 'q[barcode_eq]': code, per_page: 1 })) as { products?: RawProduct[] };
  const found = body.products?.[0];
  // Ransack ignores a filter it does not know rather than failing, so check the match itself.
  return found && found.barcode === code ? found : null;
}

type ScanBody = { stock_level_asset_number: string; quantity?: number; mark_as_prepared?: number; container?: string };

/** Allocates a unit (by asset or barcode number) to the opportunity, optionally preparing it in the same call. */
export async function quickAllocate(config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>, rmsId: number, body: ScanBody) {
  return request(config, `/opportunities/${rmsId}/quick_allocate`, {}, 1, { method: 'POST', body });
}

/** Marks an already-allocated unit (by asset or barcode number) as prepared. */
export async function quickPrepare(config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>, rmsId: number, body: ScanBody) {
  return request(config, `/opportunities/${rmsId}/quick_prepare`, {}, 1, { method: 'POST', body });
}

/** Books out the given opportunity item assets in one request. */
export async function bookOutItemAssets(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  rmsId: number,
  itemAssetIds: number[]
): Promise<{ result?: boolean; item_asset_ids?: number[]; error_messages?: string[]; warning_messages?: string[] }> {
  return request(config, `/opportunities/${rmsId}/book_out`, {}, 1, { method: 'POST', body: { item_asset_ids: itemAssetIds } }) as Promise<{
    result?: boolean;
    item_asset_ids?: number[];
    error_messages?: string[];
    warning_messages?: string[];
  }>;
}
