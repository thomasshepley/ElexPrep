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
  attempt = 1
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
    headers: {
      'X-SUBDOMAIN': config.subdomain,
      'X-AUTH-TOKEN': config.apiKey,
      Accept: 'application/json',
    },
  });

  if (res.status === 429 && attempt <= 3) {
    const retryAfterSec = Number(res.headers.get('retry-after')) || 5 * attempt;
    await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
    return request(config, path, params, attempt + 1);
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
  status?: string;
  state?: string;
  starts_at?: string;
  ends_at?: string;
  updated_at?: string;
  member?: { name?: string; business_name?: string } | null;
  [key: string]: unknown;
}

interface OpportunitiesPage {
  opportunities: RawOpportunity[];
  meta?: { total_count?: number; total_pages?: number };
}

export async function testCurrentRmsConnection(config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>) {
  await request(config, '/opportunities', { per_page: 1 });
}

/** A single page of opportunities, most-recently-updated first. */
export async function fetchOpportunitiesPage(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  opts: { page: number; perPage?: number; updatedSince?: string }
): Promise<OpportunitiesPage> {
  const params: Record<string, string | number | undefined> = {
    page: opts.page,
    per_page: opts.perPage ?? 50,
    sort: 'updated_at desc',
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
  const perPage = 50;
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

export interface RawOpportunityItem {
  id: number;
  name?: string;
  product_name?: string;
  description?: string;
  quantity?: number;
  [key: string]: unknown;
}

/**
 * Line items for an opportunity — Current RMS calls these "opportunity items". The exact
 * collection endpoint/filter isn't published in full detail; this follows the documented
 * Ransack-style filtering convention (q[opportunity_id_eq]) used elsewhere in the API.
 * Verify field names against a real response once linked — raw data is preserved either way.
 */
export async function fetchOpportunityItems(
  config: Pick<CurrentRmsConfig, 'subdomain' | 'apiKey'>,
  rmsId: number
): Promise<RawOpportunityItem[]> {
  const body = (await request(config, '/opportunity_items', {
    'q[opportunity_id_eq]': rmsId,
    per_page: 200,
  })) as { opportunity_items?: RawOpportunityItem[] };
  return body.opportunity_items ?? [];
}
