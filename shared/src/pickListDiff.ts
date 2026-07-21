export interface PickListItemSnapshot {
  id: number;
  name: string;
  quantity: number;
}

export interface PickListItemChange {
  id: number;
  name: string;
  before: number;
  after: number;
}

export interface PickListDiff {
  added: PickListItemSnapshot[];
  removed: PickListItemSnapshot[];
  changed: PickListItemChange[];
}

/**
 * Compares two pick-list snapshots (matched by the Current RMS item's stable id) to find what
 * changed between syncs — added lines, removed lines, and quantity changes on lines that
 * survived — for the signage full-screen change alert (GitHub-diff style: green/red/orange).
 */
export function diffPickListItems(before: PickListItemSnapshot[], after: PickListItemSnapshot[]): PickListDiff {
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterById = new Map(after.map((i) => [i.id, i]));

  const added = after.filter((i) => !beforeById.has(i.id));
  const removed = before.filter((i) => !afterById.has(i.id));
  const changed: PickListItemChange[] = [];
  for (const [id, afterItem] of afterById) {
    const beforeItem = beforeById.get(id);
    if (beforeItem && beforeItem.quantity !== afterItem.quantity) {
      changed.push({ id, name: afterItem.name, before: beforeItem.quantity, after: afterItem.quantity });
    }
  }

  return { added, removed, changed };
}

export function pickListDiffIsEmpty(diff: PickListDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}
