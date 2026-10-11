import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_LABEL_TEMPLATES, mergeTemplate, type LabelElementDef, type LabelType, type LabelTypeTemplate, type LocationColorMap } from '@elexprep/shared';
import { api, type AdHocLabel, type PrintQueueItem } from '../../api/client';
import SheetMirror from './SheetMirror';

export function summarize(labelType: string, content: Record<string, unknown>): string {
  switch (labelType) {
    case 'FIXTURE':
      return `#${content.address} — Uni ${content.mainUniverse}/${content.mainAddress}`;
    case 'PAL':
      return `${content.location ?? ''} — ${content.title ?? ''} ${content.subtitle ?? ''}`;
    case 'TRUSS_SPIKE_POSITION':
      return String(content.address ?? '');
    case 'TRUSS_SPIKE_TIP':
      return String(content.text ?? 'DO NOT TIP');
    case 'TRUSS_SPIKE_SACN':
      return `${content.ipAddress ?? ''}`;
    case 'CABLE':
      return `${content.text ?? ''}${content.isDmx ? ' (DMX)' : ''}`;
    case 'RACK':
      return `${content.title ?? ''} ${content.subtitle ?? ''}`;
    default:
      return JSON.stringify(content);
  }
}

type Row = {
  key: string;
  source: 'queue' | 'adhoc';
  id: string;
  quantity: number;
  content: Record<string, unknown>;
};

export default function LabelTypeSection({
  jobId,
  labelType,
  queueItems,
  adHocItems,
  selected,
  onToggleSelect,
  locationColors,
  onRefresh,
  logoUrl,
}: {
  jobId: string;
  labelType: string;
  queueItems: PrintQueueItem[];
  adHocItems: AdHocLabel[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  locationColors: LocationColorMap;
  onRefresh: () => void;
  logoUrl?: string;
}) {
  const rows: Row[] = useMemo(() => {
    const combined = [
      ...queueItems.map((q) => ({ key: `queue:${q.id}`, source: 'queue' as const, id: q.id, order: q.order, quantity: q.quantity, content: q.content })),
      ...adHocItems.map((a) => ({ key: `adhoc:${a.id}`, source: 'adhoc' as const, id: a.id, order: a.order, quantity: a.quantity, content: a.content })),
    ];
    combined.sort((a, b) => a.order - b.order);
    return combined;
  }, [queueItems, adHocItems]);

  const [template, setTemplate] = useState<LabelTypeTemplate | null>(null);
  const [isCustomized, setIsCustomized] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Partial<LabelElementDef>>>({});
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);

  useEffect(() => {
    api.labelTemplates.get(jobId, labelType).then((r) => {
      setTemplate(r.template);
      setIsCustomized(r.isCustomized);
    });
  }, [jobId, labelType]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.key === active.id);
    const newIndex = rows.findIndex((r) => r.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    await api.printQueue.reorder(
      jobId,
      labelType,
      next.map((r) => ({ source: r.source, id: r.id }))
    );
    onRefresh();
  };

  const updateRowContent = async (row: Row, patch: Record<string, unknown>) => {
    const content = { ...row.content, ...patch };
    if (row.source === 'queue') await api.printQueue.updateItem(jobId, row.id, { content });
    else await api.adHocLabels.update(jobId, row.id, { content });
    onRefresh();
  };

  const removeRow = async (row: Row) => {
    if (row.source === 'queue') await api.printQueue.removeItem(jobId, row.id);
    else await api.adHocLabels.remove(jobId, row.id);
    onRefresh();
  };

  const setQty = async (row: Row, quantity: number) => {
    if (row.source === 'queue') await api.printQueue.updateItem(jobId, row.id, { quantity });
    else await api.adHocLabels.update(jobId, row.id, { quantity });
    onRefresh();
  };

  const startCustomizing = () => {
    // Seed the draft with whatever's already been customized (inferred by diffing the merged
    // template against the shared defaults) — PUT replaces the whole override map for this
    // label type, so a save that only carries this session's edits would silently drop any
    // other element's previously saved position/size.
    const base = DEFAULT_LABEL_TEMPLATES[labelType as LabelType];
    const seeded: Record<string, Partial<LabelElementDef>> = {};
    if (base && template) {
      for (const el of template.elements) {
        const baseEl = base.elements.find((b) => b.id === el.id);
        if (!baseEl) continue;
        const patch: Partial<Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h'>> = {};
        if (el.x !== baseEl.x) patch.x = el.x;
        if (el.y !== baseEl.y) patch.y = el.y;
        if (el.w !== baseEl.w) patch.w = el.w;
        if (el.h !== baseEl.h) patch.h = el.h;
        if (Object.keys(patch).length > 0) seeded[el.id] = patch;
      }
    }
    setDraft(seeded);
    setSelectedElementId(null);
    setCustomizing(true);
  };

  const cancelCustomizing = () => {
    setDraft({});
    setSelectedElementId(null);
    setCustomizing(false);
  };

  const saveCustomization = async () => {
    const r = await api.labelTemplates.update(jobId, labelType, draft);
    setTemplate(r.template);
    setIsCustomized(r.isCustomized);
    cancelCustomizing();
  };

  const resetCustomization = async () => {
    const r = await api.labelTemplates.reset(jobId, labelType);
    setTemplate(r.template);
    setIsCustomized(r.isCustomized);
    cancelCustomizing();
  };

  const onChangeElement = (id: string, patch: Partial<Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h'>>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  if (!template || rows.length === 0) return null;

  const previewItem = rows[0].content;
  const displayTemplate = customizing ? mergeTemplate(template, draft) : template;
  const selectedElement = selectedElementId ? displayTemplate.elements.find((e) => e.id === selectedElementId) : null;

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>{labelType}</h3>
          {isCustomized && <span className="chip chip-neutral">Custom layout</span>}
        </div>
        {!customizing ? (
          <button className="secondary" onClick={startCustomizing}>
            Customize layout
          </button>
        ) : (
          <div className="row">
            <button className="secondary" onClick={cancelCustomizing}>
              Cancel
            </button>
            {isCustomized && (
              <button className="secondary" onClick={resetCustomization}>
                Reset to default
              </button>
            )}
            <button onClick={saveCustomization} disabled={Object.keys(draft).length === 0}>
              Save layout
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <div>
          <SheetMirror
            template={displayTemplate}
            item={previewItem}
            locationColors={locationColors}
            logoUrl={logoUrl}
            editable={customizing}
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
            onChangeElement={onChangeElement}
          />
          {customizing && (
            <>
              <p className="muted" style={{ maxWidth: 320, fontSize: 'var(--text-sm)' }}>
                Drag an element to move it, or drag its corner handle to resize. Elements that overlap
                can also be picked below. Changes apply to every label of this type on this job once saved.
              </p>
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                {displayTemplate.elements.map((el) => (
                  <button
                    key={el.id}
                    className={selectedElementId === el.id ? undefined : 'secondary'}
                    style={{ padding: '0.15rem 0.6rem', fontSize: 'var(--text-sm)' }}
                    onClick={() => setSelectedElementId(el.id)}
                  >
                    {el.id}
                  </button>
                ))}
              </div>
            </>
          )}
          {customizing && selectedElement && (
            <ElementInspector element={selectedElement} onChange={(patch) => onChangeElement(selectedElement.id, patch)} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th></th>
                    <th>Content</th>
                    <th>Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <SortableRow
                      key={row.key}
                      row={row}
                      labelType={labelType}
                      selected={row.source === 'queue' ? selected.has(row.id) : true}
                      selectable={row.source === 'queue'}
                      onToggleSelect={() => row.source === 'queue' && onToggleSelect(row.id)}
                      onSetQty={(q) => setQty(row, q)}
                      onRemove={() => removeRow(row)}
                      editing={editingRow === row.key}
                      onToggleEdit={() => setEditingRow(editingRow === row.key ? null : row.key)}
                      onSaveContent={(patch) => updateRowContent(row, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

function SortableRow({
  row,
  labelType,
  selected,
  selectable,
  onToggleSelect,
  onSetQty,
  onRemove,
  editing,
  onToggleEdit,
  onSaveContent,
}: {
  row: Row;
  labelType: string;
  selected: boolean;
  selectable: boolean;
  onToggleSelect: () => void;
  onSetQty: (q: number) => void;
  onRemove: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  onSaveContent: (patch: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.key });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <>
      <tr ref={setNodeRef} style={style}>
        <td {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--content-muted)' }} title="Drag to reorder">
          ⠿
        </td>
        <td>
          <input type="checkbox" checked={selected} disabled={!selectable} onChange={onToggleSelect} title={selectable ? '' : 'Ad hoc labels are always included'} />
        </td>
        <td>
          {summarize(labelType, row.content)}
          <button className="secondary" style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem' }} onClick={onToggleEdit}>
            {editing ? 'Close' : 'Edit'}
          </button>
        </td>
        <td>
          <input
            type="number"
            min={1}
            defaultValue={row.quantity}
            style={{ width: 60 }}
            onBlur={(e) => onSetQty(Number(e.target.value))}
          />
        </td>
        <td>
          <button className="secondary" onClick={onRemove}>
            Remove
          </button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={5}>
            <ContentEditor content={row.content} onSave={onSaveContent} />
          </td>
        </tr>
      )}
    </>
  );
}

function ContentEditor({ content, onSave }: { content: Record<string, unknown>; onSave: (patch: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(content);

  const fields = Object.entries(content).filter(([, v]) => v === null || typeof v !== 'object');

  return (
    <div className="panel" style={{ margin: '0.5rem 0', background: 'var(--surface-sunken)' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        {fields.map(([key, value]) => (
          <label key={key} className="field" style={{ minWidth: 160 }}>
            <span>{key}</span>
            {typeof value === 'boolean' ? (
              <input
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
              />
            ) : (
              <input
                type={typeof value === 'number' ? 'number' : 'text'}
                value={values[key] == null ? '' : String(values[key])}
                onChange={(e) => setValues((v) => ({ ...v, [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <button style={{ marginTop: '0.5rem' }} onClick={() => onSave(values)}>
        Save content
      </button>
    </div>
  );
}

function ElementInspector({ element, onChange }: { element: LabelElementDef; onChange: (patch: Partial<Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h'>>) => void }) {
  return (
    <div className="panel" style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--surface-sunken)' }}>
      <p className="muted" style={{ marginTop: 0 }}>
        {element.id} — position &amp; size (inches)
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} className="field" style={{ minWidth: 70 }}>
            <span>{k}</span>
            <input
              type="number"
              step={0.05}
              value={element[k]}
              onChange={(e) => onChange({ [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
