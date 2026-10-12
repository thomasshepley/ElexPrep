import type { Readable } from 'stream';
import { OneDriveConfig } from './config';

// Overridable so a local mock server can stand in for the real endpoints during verification -
// same pattern as CURRENT_RMS_BASE_URL in currentRms/client.ts.
export const GRAPH_AUTH_BASE_URL = process.env.GRAPH_AUTH_BASE_URL ?? 'https://login.microsoftonline.com';
export const GRAPH_API_BASE_URL = process.env.GRAPH_API_BASE_URL ?? 'https://graph.microsoft.com/v1.0';

export class OneDriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class OneDriveNotConfiguredError extends OneDriveError {
  constructor() {
    super('OneDrive is not configured - add Azure app credentials in Settings -> OneDrive first', 400);
  }
}

export interface DriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
  webUrl?: string;
  /// Graph returns this by default on every item; typed here so callers (e.g. the patch
  /// auto-detect, which picks the most recently modified CSV) don't have to request it specially.
  lastModifiedDateTime?: string;
}

function assertConfigured(config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>) {
  if (!config.enabled || !config.tenantId || !config.clientId || !config.clientSecret || !config.driveId) {
    throw new OneDriveNotConfiguredError();
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Client-credentials (app-only) OAuth2 flow against the tenant's token endpoint. Cached in
 * memory until shortly before it expires - this integration never acts as a specific user, so
 * there's no refresh token or per-user session to manage. */
async function getAccessToken(config: Pick<OneDriveConfig, 'tenantId' | 'clientId' | 'clientSecret'>): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await fetch(`${GRAPH_AUTH_BASE_URL}/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OneDriveError(`Azure AD rejected the OneDrive app credentials: ${body.slice(0, 300)}`, res.status);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function graphRequest(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  assertConfigured(config);
  const token = await getAccessToken(config);
  const res = await fetch(`${GRAPH_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 404) throw new OneDriveError('Not found', 404);
    const body = await res.text().catch(() => '');
    throw new OneDriveError(`Microsoft Graph API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`, res.status);
  }
  return res.json();
}

/** Lists the immediate children of a folder (or the drive root, if no folderId is given). */
export async function listChildren(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>,
  folderId?: string
): Promise<DriveItem[]> {
  const path = folderId ? `/drives/${config.driveId}/items/${folderId}/children` : `/drives/${config.driveId}/root/children`;
  const body = (await graphRequest(config, path)) as { value?: DriveItem[] };
  return body.value ?? [];
}

/** Resolves a `/`-separated path (relative to the drive root) directly to its item, where the
 * Graph API supports it in one call rather than walking each segment by hand. */
export async function getItemByPath(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>,
  relativePath: string
): Promise<DriveItem | null> {
  try {
    const encoded = relativePath
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return (await graphRequest(config, `/drives/${config.driveId}/root:/${encoded}`)) as DriveItem;
  } catch (err) {
    if (err instanceof OneDriveError && err.status === 404) return null;
    throw err;
  }
}

/** Case-insensitive, trimmed name match among a folder's children - real-world folder names
 * rarely match a candidate exactly byte-for-byte (trailing spaces, different casing). */
export function findChildByName(children: DriveItem[], name: string): DriveItem | null {
  const target = name.trim().toLowerCase();
  return children.find((c) => c.name.trim().toLowerCase() === target) ?? null;
}

export async function streamOneDriveFile(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>,
  itemId: string
): Promise<{ stream: Readable; contentType: string; fileName: string }> {
  assertConfigured(config);
  const token = await getAccessToken(config);
  const metaRes = await fetch(`${GRAPH_API_BASE_URL}/drives/${config.driveId}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new OneDriveError(`Could not read file metadata (${metaRes.status})`, metaRes.status);
  const meta = (await metaRes.json()) as DriveItem;

  const contentRes = await fetch(`${GRAPH_API_BASE_URL}/drives/${config.driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });
  if (!contentRes.ok || !contentRes.body) throw new OneDriveError(`Could not download file content (${contentRes.status})`, contentRes.status);

  const { Readable: NodeReadable } = await import('stream');
  const stream = NodeReadable.fromWeb(contentRes.body as never);
  return { stream, contentType: meta.file?.mimeType ?? 'application/octet-stream', fileName: meta.name };
}

export async function testOneDriveConnection(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId'>
): Promise<void> {
  await listChildren({ ...config, enabled: true });
}
