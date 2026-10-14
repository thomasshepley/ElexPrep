import type { Response } from 'express';

/**
 * Server-Sent Events for prep screens and phones. One process, so subscribers live in memory:
 * each stream follows one job and/or one bay. Events are small notices ("this job's prep
 * changed", "a scan happened") and the screen re-reads the view, so a dropped event costs at
 * most one refresh (the screen also polls as a safety net).
 */

interface Subscriber {
  res: Response;
  jobId: string | null;
  bayId: string | null;
}

const subscribers = new Set<Subscriber>();
let nextEventId = 1;

function write(res: Response, event: string, data: unknown) {
  res.write(`id: ${nextEventId++}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function openPrepStream(res: Response, filter: { jobId: string | null; bayId: string | null }) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Stops Caddy/nginx buffering the stream.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const sub: Subscriber = { res, ...filter };
  subscribers.add(sub);
  write(res, 'hello', { at: new Date().toISOString() });
  // A comment every 20 s keeps proxies from closing an idle stream.
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  res.on('close', () => {
    clearInterval(ping);
    subscribers.delete(sub);
  });
}

export function emitJobEvent(jobId: string, event: string, data: Record<string, unknown> = {}) {
  for (const sub of subscribers) if (sub.jobId === jobId) write(sub.res, event, { jobId, ...data });
}

export function emitBayEvent(bayId: string, event: string, data: Record<string, unknown> = {}) {
  for (const sub of subscribers) if (sub.bayId === bayId) write(sub.res, event, { bayId, ...data });
}

export function prepStreamCount() {
  return subscribers.size;
}
