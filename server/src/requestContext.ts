import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Populates an IP/user-agent context for the lifetime of a request, so logActivity() (see
 * db.ts) can read it automatically without every one of its 80+ call sites having to thread
 * `req` through. Mounted first, before authMiddleware, so even unauthenticated requests
 * (a failed login attempt) get it. Express's req.ip honors `trust proxy` (set in index.ts)
 * so this reflects the real client address behind the documented reverse-proxy deployment,
 * not the proxy's own address.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const context: RequestContext = {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
  storage.run(context, next);
}

/** Null outside an HTTP request (a background timer, a script) - logActivity treats that as
 * "no IP/user-agent to record" rather than an error. */
export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}
