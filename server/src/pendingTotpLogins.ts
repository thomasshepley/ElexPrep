import crypto from 'crypto';

/**
 * The gap between "password verified" and "session created" for a 2FA-enabled account — in
 * memory only, not a database table, since it's short-lived (5 minutes) and losing it on a
 * server restart just means the user re-enters their password, the same posture as this
 * codebase's other in-memory runtime state (currentRms/sync.ts's `syncing` flag, `pollTimer`).
 * A pending login proves nothing on its own — the token is a 256-bit random value the client
 * must already hold, and it still requires a correct second-factor code before any session is
 * created.
 */
interface PendingLogin {
  userId: string;
  expiresAt: number;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const TTL_MS = 5 * 60 * 1000;

const pending = new Map<string, PendingLogin>();

function sweepExpired() {
  const now = Date.now();
  for (const [token, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(token);
  }
}

export function createPendingLogin(userId: string): string {
  sweepExpired();
  const token = crypto.randomBytes(32).toString('base64url');
  pending.set(token, { userId, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return token;
}

/** Returns the pending login's userId without consuming it — the caller still has to verify
 * a code before calling consumePendingLogin. Increments the attempt counter and evicts the
 * entry once MAX_ATTEMPTS is exceeded, so a 6-digit code can't be brute-forced within the TTL. */
export function checkPendingLogin(token: string): { userId: string } | null {
  sweepExpired();
  const entry = pending.get(token);
  if (!entry) return null;
  if (entry.attempts >= MAX_ATTEMPTS) {
    pending.delete(token);
    return null;
  }
  entry.attempts++;
  return { userId: entry.userId };
}

export function consumePendingLogin(token: string): void {
  pending.delete(token);
}
