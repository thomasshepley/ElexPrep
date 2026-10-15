import { request } from '../http';

/**
 * Prep bays (routes/prep.ts). A bay screen remembers which bay it is (a token, kept on the
 * screen) and who is signed in on it (the operator token); both ride along as headers so the
 * server knows which bay and which crew member each request comes from.
 */

const BAY_KEY = 'elex-prep-bay';
const OPERATOR_KEY = 'elex-prep-operator';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // A locked-down kiosk browser may block storage; the screen then asks again after a reload.
  }
}

export const bayStore = {
  bayToken: () => read(BAY_KEY),
  setBayToken: (t: string | null) => write(BAY_KEY, t),
  operatorToken: () => read(OPERATOR_KEY),
  setOperatorToken: (t: string | null) => write(OPERATOR_KEY, t),
};

/** Headers for a bay screen's requests. A phone passes only its paired bay, never an operator. */
function bayHeaders(opts: { bay?: string | null; operator?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = {};
  const bay = opts.bay !== undefined ? opts.bay : bayStore.bayToken();
  if (bay) h['X-Prep-Bay'] = bay;
  if (opts.operator !== false) {
    const op = bayStore.operatorToken();
    if (op) h['X-Prep-Operator'] = op;
  }
  return h;
}

export type PrepStatus = 'OPEN' | 'AWAITING_TRANSPORT' | 'BOOKED_OUT';
export type ScanResult = 'OK' | 'OVER' | 'DUPLICATE' | 'WRONG_JOB' | 'UNKNOWN' | 'LOCKED' | 'SWITCH_JOB';

export interface PrepConfigPublic {
  scannerPrefix: string;
  scannerSuffix: 'Enter' | 'Tab';
  sound: boolean;
  operatorIdleMinutes: number;
}

export interface PrepConfig extends PrepConfigPublic {
  rmsWriteBack: 'OFF' | 'DRY_RUN' | 'LIVE';
}

export interface BayOperator {
  id: string;
  displayName: string;
  role: string;
  avatarPath: string | null;
  signedInAt: string;
}

export interface BayInfo {
  id: string;
  name: string;
  token: string;
  currentJobId: string | null;
  operator: BayOperator | null;
  config: PrepConfigPublic;
}

export interface PrepJobOption {
  id: string;
  name: string;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  prep: { status: PrepStatus; flagged: boolean } | null;
}

export interface PrepLine {
  key: string;
  productId: number | null;
  name: string;
  group: string | null;
  required: number;
  pulled: number;
  short: number;
  shortNote: string | null;
  accessory: boolean;
  bookedOut: boolean;
  done: boolean;
  over: number;
}

export interface PrepScan {
  id: string;
  code: string;
  kind: string;
  result: ScanResult;
  message: string;
  source: string;
  lineKey?: string | null;
  by: string | null;
  at: string;
  switchToJobId?: string;
}

export interface MissingLine {
  key: string;
  name: string;
  required: number;
  pulled: number;
  short: number;
  shortNote: string | null;
}

export interface PrepView {
  job: { id: string; name: string; venue: string | null; hasLogo: boolean; startsAt: string | null; endsAt: string | null; linked: boolean; hasRmsDiff: boolean };
  source: 'RMS' | 'FIXTURES' | 'OFFLINE';
  rmsError: string | null;
  fetchedAt: string;
  session: {
    id: string;
    status: PrepStatus;
    startedAt: string;
    startedBy: string | null;
    completedAt: string | null;
    completedBy: string | null;
    transportAt: string | null;
    transportBy: string | null;
    missing: MissingLine[];
    flaggedAt: string | null;
    flagResolvedAt: string | null;
    flagResolvedBy: string | null;
    bookOut: { mode: 'OFF' | 'DRY_RUN' | 'LIVE'; itemAssetIds: number[]; ok: boolean; errors: string[]; warnings: string[]; notPrepped: MissingLine[] } | null;
  } | null;
  totals: { lines: number; linesDone: number; required: number; pulled: number; short: number };
  next: PrepLine | null;
  groups: { name: string; required: number; pulled: number; lines: PrepLine[] }[];
  shortages: PrepLine[];
  cases: { location: string; color: string; pattern: string; total: number; packed: number; cases: { id: string; label: string; fixtureType: string; packed: boolean }[] }[];
  recentScans: PrepScan[];
}

export interface AdminBay {
  id: string;
  name: string;
  token: string;
  lastSeenAt: string | null;
  job: { id: string; name: string } | null;
  operator: { name: string; since: string } | null;
  progress: { pulled: number; required: number; status: PrepStatus | null; flagged: boolean } | null;
}

export interface BarcodeAlias {
  id: string;
  code: string;
  kind: 'ASSET' | 'PRODUCT';
  rmsProductId: number | null;
  label: string;
  source: 'RMS' | 'TAUGHT';
  updatedAt: string;
}

export interface UnknownCode {
  code: string;
  jobId: string;
  jobName: string | null;
  lastAt: string;
  count: number;
}

const json = (body: unknown) => JSON.stringify(body);

export const baysApi = {
  bays: {
    /** Bay names, for a new screen to pick from. */
    list: () => request<{ id: string; name: string }[]>('/prep/bays'),
    claim: (id: string) => request<{ id: string; name: string; token: string }>(`/prep/bays/${id}/claim`, { method: 'POST' }),
    current: () => request<BayInfo>('/prep/bay', { headers: bayHeaders() }),
    setJob: (jobId: string | null) => request<{ currentJobId: string | null }>('/prep/bay/job', { method: 'PUT', body: json({ jobId }), headers: bayHeaders() }),
    operatorLogin: (data: { username: string; password: string; code?: string; backupCode?: string }) =>
      request<{ token?: string; operator?: BayOperator; requiresTotp?: boolean }>('/prep/operator/login', { method: 'POST', body: json(data), headers: bayHeaders({ operator: false }) }),
    operatorLogout: () => request<void>('/prep/operator/logout', { method: 'POST', headers: bayHeaders() }),
    operatorPing: () => request<void>('/prep/operator/ping', { method: 'POST', headers: bayHeaders() }),
    /** Jobs the signed-in operator (or, on a phone, the user) can prep. */
    jobs: (opts: { phone?: boolean } = {}) => request<PrepJobOption[]>('/prep/operator/jobs', { headers: opts.phone ? {} : bayHeaders() }),
    pair: (bayToken: string) => request<{ bay: { id: string; name: string }; job: { id: string; name: string } | null; config: PrepConfigPublic }>(`/prep/pair?bay=${encodeURIComponent(bayToken)}`),
  },
  prepJob: {
    view: (jobId: string, opts: { phone?: boolean; fresh?: boolean } = {}) =>
      request<PrepView>(`/prep/jobs/${jobId}/view${opts.fresh ? '?fresh=1' : ''}`, { headers: opts.phone ? {} : bayHeaders() }),
    scan: (jobId: string, code: string, source: 'HID' | 'PHONE' | 'MANUAL', opts: { phone?: boolean; bay?: string | null } = {}) =>
      request<PrepScan>(`/prep/jobs/${jobId}/scan`, {
        method: 'POST',
        body: json({ code, source }),
        headers: opts.phone ? bayHeaders({ bay: opts.bay ?? null, operator: false }) : bayHeaders(),
      }),
    adjust: (jobId: string, data: { lineKey: string; delta?: 1 | -1; short?: number; shortNote?: string | null }) =>
      request<{ scan: PrepScan }>(`/prep/jobs/${jobId}/lines`, { method: 'POST', body: json(data), headers: bayHeaders() }),
    setCasePacked: (jobId: string, caseId: string, packed: boolean) =>
      request<{ id: string; packed: boolean }>(`/prep/jobs/${jobId}/cases/${caseId}`, { method: 'POST', body: json({ packed }), headers: bayHeaders() }),
    signOff: (jobId: string) => request<{ missing: MissingLine[] }>(`/prep/jobs/${jobId}/sign-off`, { method: 'POST', headers: bayHeaders() }),
    transport: (jobId: string) => request<{ notPrepped: MissingLine[] }>(`/prep/jobs/${jobId}/transport`, { method: 'POST', headers: bayHeaders() }),
    reopen: (jobId: string) => request<void>(`/prep/jobs/${jobId}/reopen`, { method: 'POST' }),
    resolveFlag: (jobId: string) => request<void>(`/prep/jobs/${jobId}/resolve-flag`, { method: 'POST' }),
    status: (jobId: string) => request<Pick<PrepView, 'session' | 'totals' | 'source'>>(`/prep/jobs/${jobId}/status`),
    scans: (jobId: string) => request<(PrepScan & { createdAt: string })[]>(`/prep/jobs/${jobId}/scans`),
    diff: (jobId: string) => request<{ diff: import('@elexprep/shared').PickListDiff | null }>(`/prep/jobs/${jobId}/diff`, { headers: bayHeaders() }),
    acknowledgeDiff: (jobId: string) => request<void>(`/prep/jobs/${jobId}/diff/acknowledge`, { method: 'POST', headers: bayHeaders() }),
  },
  prepAdmin: {
    config: () => request<PrepConfig>('/prep/admin/config'),
    saveConfig: (patch: Partial<PrepConfig>) => request<PrepConfig>('/prep/admin/config', { method: 'PUT', body: json(patch) }),
    bays: () => request<AdminBay[]>('/prep/admin/bays'),
    createBay: (name: string) => request<AdminBay>('/prep/admin/bays', { method: 'POST', body: json({ name }) }),
    renameBay: (id: string, name: string) => request<AdminBay>(`/prep/admin/bays/${id}`, { method: 'PUT', body: json({ name }) }),
    newToken: (id: string) => request<AdminBay>(`/prep/admin/bays/${id}/new-token`, { method: 'POST' }),
    signOutBay: (id: string) => request<void>(`/prep/admin/bays/${id}/sign-out`, { method: 'POST' }),
    deleteBay: (id: string) => request<void>(`/prep/admin/bays/${id}`, { method: 'DELETE' }),
    aliases: () => request<BarcodeAlias[]>('/prep/admin/aliases'),
    unknownCodes: () => request<UnknownCode[]>('/prep/admin/unknown-codes'),
    teach: (data: { code: string; kind: 'ASSET' | 'PRODUCT'; jobId: string; lineKey: string }) =>
      request<BarcodeAlias>('/prep/admin/aliases', { method: 'POST', body: json(data) }),
    deleteAlias: (id: string) => request<void>(`/prep/admin/aliases/${id}`, { method: 'DELETE' }),
  },
};

/** The live-updates URL for a job and/or bay (EventSource can't send headers, so it's query params). */
export function prepStreamUrl(opts: { jobId?: string | null; bayToken?: string | null }) {
  const q = new URLSearchParams();
  if (opts.jobId) q.set('job', opts.jobId);
  if (opts.bayToken) q.set('bay', opts.bayToken);
  return `/api/prep/stream?${q.toString()}`;
}
