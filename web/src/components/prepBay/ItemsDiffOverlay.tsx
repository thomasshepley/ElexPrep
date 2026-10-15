import type { PickListDiff } from '@elexprep/shared';
import type { PrepLine } from '../../api/client';

/**
 * Full-screen "Job changed" alert: red for lines removed from the pick list, green for lines
 * added, orange for quantity changes, plus which already-pulled lines are now over or still short
 * because of the change. Shown the moment the Current RMS sync sees the opportunity change, until
 * someone on the screen dismisses it.
 */
export default function ItemsDiffOverlay({ diff, lines, onDismiss }: { diff: PickListDiff; lines: PrepLine[]; onDismiss: () => void }) {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const affected = diff.changed
    .map((c) => ({ change: c, line: byKey.get(`rms:${c.id}`) }))
    .filter((a) => a.line && (a.line.over > 0 || (a.line.pulled > 0 && a.line.pulled < a.line.required)));
  return (
    <div className="bay-diff" role="alertdialog" aria-labelledby="bay-diff-title">
      <h1 id="bay-diff-title">Job changed</h1>
      <p className="bay-diff-sub">The Current RMS pick list for this job has changed.</p>
      <div className="bay-diff-grid">
        {diff.removed.length > 0 && (
          <div>
            <h2 className="bay-diff-removed">Removed</h2>
            {diff.removed.map((i) => (
              <div key={i.id} className="bay-diff-removed">
                {i.name} ×{i.quantity}
              </div>
            ))}
          </div>
        )}
        {diff.added.length > 0 && (
          <div>
            <h2 className="bay-diff-added">Added</h2>
            {diff.added.map((i) => (
              <div key={i.id} className="bay-diff-added">
                {i.name} ×{i.quantity}
              </div>
            ))}
          </div>
        )}
        {diff.changed.length > 0 && (
          <div>
            <h2 className="bay-diff-changed">Quantity changed</h2>
            {diff.changed.map((i) => (
              <div key={i.id} className="bay-diff-changed">
                {i.name}: {i.before} → {i.after}
              </div>
            ))}
          </div>
        )}
        {affected.length > 0 && (
          <div>
            <h2>Already pulled</h2>
            {affected.map(({ change, line }) => (
              <div key={change.id}>
                {line!.name}: {line!.over > 0 ? `${line!.over} too many pulled, put back` : `${line!.required - line!.pulled} more to pull`}
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="bay-button" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
