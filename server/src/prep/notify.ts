import { emitJobEvent } from './events';
import { invalidateSourceLines } from './lines';

/** The linked opportunity changed: drop the cached pick list and tell any open prep screen. */
export function notifyPrepJobChanged(jobId: string) {
  invalidateSourceLines(jobId);
  emitJobEvent(jobId, 'rms-diff');
}
