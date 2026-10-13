import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from './db';
import { uploadDir } from './routes/jobs';
import { IMAGE_KINDS, acceptMemoryUpload, randomUploadName } from './uploadSafety';

/**
 * What staff (routes/jobDiscussion.ts) and crew (routes/crewPortal.ts) share about a discussion
 * message: its JSON shape (including the message it replies to, quoted WhatsApp-style), checking
 * a reply target, and storing an attached image or GIF.
 */

export const discussionUploadsDir = path.join(uploadDir, 'discussion');
fs.mkdirSync(discussionUploadsDir, { recursive: true });

export const MAX_MESSAGE_LENGTH = 5000;
const QUOTE_LENGTH = 160;

/** Memory storage so the bytes can be sniffed before anything touches disk. */
export const discussionImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const AUTHOR_SELECT = { displayName: true, role: true, isProjectManager: true } as const;

export const MESSAGE_INCLUDE = {
  authorUser: { select: AUTHOR_SELECT },
  replyTo: { include: { authorUser: { select: AUTHOR_SELECT } } },
} as const;

interface MessageCore {
  id: string;
  authorUserId: string;
  body: string;
  deletedAt: Date | null;
  attachmentPath: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  authorUser: { displayName: string; role: string; isProjectManager: boolean };
}

interface MessageRow extends MessageCore {
  jobId: string;
  groupId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedByName: string | null;
  replyToId: string | null;
  replyTo: MessageCore | null;
}

function attachmentDto(m: MessageCore) {
  return !m.deletedAt && m.attachmentPath ? { name: m.attachmentName ?? 'image', mime: m.attachmentMime ?? 'image/*' } : null;
}

export function toMessageDto(m: MessageRow) {
  const quoted = m.replyTo;
  return {
    id: m.id,
    jobId: m.jobId,
    authorUserId: m.authorUserId,
    authorName: m.authorUser.displayName,
    authorRole: m.authorUser.role,
    authorIsProjectManager: m.authorUser.isProjectManager,
    // A moderator-removed message never sends its original text to clients - only the
    // placeholder metadata (see JobDiscussionThread.tsx's rendering of deletedByName).
    body: m.deletedAt ? '' : m.body,
    attachment: attachmentDto(m),
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    deletedByName: m.deletedByName,
    replyTo: quoted
      ? {
          id: quoted.id,
          authorName: quoted.authorUser.displayName,
          authorRole: quoted.authorUser.role,
          authorIsProjectManager: quoted.authorUser.isProjectManager,
          deleted: quoted.deletedAt !== null,
          body: quoted.deletedAt ? '' : quoted.body.length > QUOTE_LENGTH ? `${quoted.body.slice(0, QUOTE_LENGTH)}…` : quoted.body,
          hasImage: attachmentDto(quoted) !== null,
        }
      : null,
  };
}

/** Text + optional reply target from a JSON or multipart body. */
export function parseMessageInput(body: unknown, hasImage: boolean): { text: string; replyToId: string | null; groupId: unknown } | { error: string } {
  const { body: raw, replyToId, groupId } = (body ?? {}) as Record<string, unknown>;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text && !hasImage) return { error: 'Write a message or add an image' };
  if (text.length > MAX_MESSAGE_LENGTH) return { error: 'Message is too long' };
  if (replyToId !== undefined && replyToId !== null && replyToId !== '' && typeof replyToId !== 'string') return { error: 'replyToId must be a message id' };
  return { text, replyToId: typeof replyToId === 'string' && replyToId ? replyToId : null, groupId: groupId || undefined };
}

/** A reply has to point at a message in the same job and chat group. */
export async function checkReplyTarget(jobId: string, groupId: string, replyToId: string | null): Promise<string | null> {
  if (!replyToId) return null;
  const target = await prisma.jobDiscussionMessage.findUnique({ where: { id: replyToId }, select: { jobId: true, groupId: true } });
  if (!target || target.jobId !== jobId || target.groupId !== groupId) return 'The message you replied to is no longer in this chat';
  return null;
}

/** Sniffs and stores an uploaded image/GIF; throws RejectedUploadError for anything else. */
export async function storeDiscussionImage(file: Express.Multer.File) {
  acceptMemoryUpload(file, IMAGE_KINDS);
  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[file.mimetype] ?? '';
  const fileName = `${randomUploadName()}${ext}`;
  await fs.promises.writeFile(path.join(discussionUploadsDir, fileName), file.buffer);
  return { attachmentPath: fileName, attachmentMime: file.mimetype, attachmentName: file.originalname.slice(0, 200) || `image${ext}` };
}

export async function removeDiscussionImage(attachmentPath: string | null) {
  if (attachmentPath) await fs.promises.unlink(path.join(discussionUploadsDir, attachmentPath)).catch(() => {});
}

/** Notification text for a message - a photo with no caption still says something. */
export function notificationText(text: string, hasImage: boolean): string {
  if (!hasImage) return text;
  return text ? `📷 ${text}` : '📷 Sent an image';
}
