import type { ReactNode } from 'react';

/** Renders its children read-only (every input/button disabled) when the viewer lacks the
 * permission an editing page needs, with a one-line note saying why. */
export default function PermissionFieldset({ allowed, note, children }: { allowed: boolean; note: string; children: ReactNode }) {
  return (
    <>
      {!allowed && <p className="muted">{note}</p>}
      <fieldset disabled={!allowed} className="plain-fieldset">
        {children}
      </fieldset>
    </>
  );
}
