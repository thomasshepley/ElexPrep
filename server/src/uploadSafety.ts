import fs from 'fs';
import path from 'path';
import { Response } from 'express';

/**
 * Every user upload is identified by its magic bytes, never the client-supplied mime type or
 * extension: an "image" that is really an SVG/HTML file would otherwise be served back inline on
 * our origin and run script in whoever opens it. Only these kinds are ever stored or served inline.
 */
export type SafeKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf';

const KIND_MIME: Record<SafeKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const KIND_EXT: Record<SafeKind, string> = {
  png: '.png',
  jpeg: '.jpg',
  gif: '.gif',
  webp: '.webp',
  pdf: '.pdf',
};

export const IMAGE_KINDS: readonly SafeKind[] = ['png', 'jpeg', 'gif', 'webp'];
export const DOCUMENT_KINDS: readonly SafeKind[] = [...IMAGE_KINDS, 'pdf'];
export const PDF_KINDS: readonly SafeKind[] = ['pdf'];

const SAFE_INLINE_MIMES = new Set(Object.values(KIND_MIME));

export function sniffKind(head: Buffer): SafeKind | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 6 && (head.toString('latin1', 0, 6) === 'GIF87a' || head.toString('latin1', 0, 6) === 'GIF89a')) return 'gif';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  // PDF readers tolerate up to 1 KB of junk before the header, but nothing we accept needs that.
  if (head.length >= 5 && head.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

async function readHead(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buf, 0, 16, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export class RejectedUploadError extends Error {
  constructor(allowed: readonly SafeKind[]) {
    super(`Unsupported file type - upload ${describeKinds(allowed)}`);
  }
}

function describeKinds(allowed: readonly SafeKind[]): string {
  const hasPdf = allowed.includes('pdf');
  const hasImage = allowed.some((k) => k !== 'pdf');
  if (hasPdf && hasImage) return 'a PDF or an image (PNG, JPEG, GIF, WebP)';
  if (hasPdf) return 'a PDF';
  return 'an image (PNG, JPEG, GIF, WebP)';
}

/**
 * For a multer disk-storage file: sniffs it, deletes it and throws if it isn't an allowed kind,
 * otherwise renames it to a server-chosen extension. Mutates the multer file object so the caller
 * keeps using file.filename/file.mimetype as before - both now trustworthy.
 */
export async function acceptDiskUpload(file: Express.Multer.File, allowed: readonly SafeKind[]): Promise<void> {
  const accepted = await acceptFileAtPath(file.path, allowed);
  file.filename = accepted.filename;
  file.path = accepted.path;
  file.mimetype = accepted.mimetype;
}

/** Same check for a file already written to disk by our own code (e.g. fetched from OneDrive). */
export async function acceptFileAtPath(
  filePath: string,
  allowed: readonly SafeKind[]
): Promise<{ path: string; filename: string; mimetype: string }> {
  const kind = sniffKind(await readHead(filePath));
  if (!kind || !allowed.includes(kind)) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new RejectedUploadError(allowed);
  }
  const current = path.basename(filePath);
  const filename = `${path.basename(current, path.extname(current))}${KIND_EXT[kind]}`;
  const dest = path.join(path.dirname(filePath), filename);
  if (dest !== filePath) await fs.promises.rename(filePath, dest);
  return { path: dest, filename, mimetype: KIND_MIME[kind] };
}

/** Memory-storage equivalent - throws if not allowed, otherwise overwrites file.mimetype. */
export function acceptMemoryUpload(file: Express.Multer.File, allowed: readonly SafeKind[]): void {
  const kind = sniffKind(file.buffer.subarray(0, 16));
  if (!kind || !allowed.includes(kind)) throw new RejectedUploadError(allowed);
  file.mimetype = KIND_MIME[kind];
}

/** Random server-side filename stem - never derived from the client's name. */
export function randomUploadName(): string {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function applyServeHeaders(res: Response, kind: SafeKind | null, fileName: string) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!kind) {
    // Anything stored before upload sniffing existed, or not one of the safe kinds: never render
    // it on our origin, only offer it as a download.
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition('attachment', fileName));
    return;
  }
  res.setHeader('Content-Type', KIND_MIME[kind]);
  res.setHeader('Content-Disposition', contentDisposition('inline', fileName));
  // A sandbox CSP stops the built-in PDF viewer, so only images get it.
  if (kind !== 'pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
}

/** Serves a stored upload with headers derived from its actual bytes. */
export async function sendStoredUpload(res: Response, filePath: string, downloadName: string) {
  let head: Buffer;
  try {
    head = await readHead(filePath);
  } catch {
    return res.status(404).end();
  }
  applyServeHeaders(res, sniffKind(head), downloadName);
  res.sendFile(filePath);
}

export function sendUploadBuffer(res: Response, data: Buffer, downloadName: string) {
  applyServeHeaders(res, sniffKind(data.subarray(0, 16)), downloadName);
  res.send(data);
}

/** For bytes streamed from a third party (OneDrive): trust its content type only for the safe
 * inline kinds, otherwise force a download. */
export function applyStreamHeaders(res: Response, contentType: string, fileName: string) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (SAFE_INLINE_MIMES.has(mime)) {
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDisposition('inline', fileName));
    if (mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition('attachment', fileName));
  }
}
