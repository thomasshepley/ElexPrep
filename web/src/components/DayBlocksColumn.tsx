import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { resolveCrewColor } from '@elexprep/shared';
import { api, type JobCrewAssignment, type JobDay } from '../api/client';
import { useToast } from './Toast';
import { formatDate } from '../utils/format';

export interface DayBlockView {
  dateKey: string;
  /** Null until something materializes this day server-side - see JobSchedulePanel. */
  day: JobDay | null;
  itemCount: number;
}

/** Local midnight (in this browser's own timezone) for the given YYYY-MM-DD key, as an ISO
 * string - this is what lets a day round-trip to the same calendar day for whoever added it,
 * regardless of what timezone the server itself runs in (see JobDay's schema comment). Also
 * used by JobSchedulePanel to resolve the day a dragged-onto schedule item falls on. */
export function localMidnightIso(key: string): string {
  return new Date(`${key}T00:00:00`).toISOString();
}

function formatDayLabel(key: string): string {
  return formatDate(`${key}T00:00:00`);
}

export function CrewChip({ assignment }: { assignment: JobCrewAssignment }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `roster:${assignment.id}` });
  const color = resolveCrewColor(assignment.crewProfileId, assignment.color);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="day-block-crew-chip day-block-crew-chip-draggable"
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, opacity: isDragging ? 0.4 : 1 }}
    >
      <span className="crew-swatch-dot" style={{ background: color }} />
      {assignment.displayName} <span className="muted">· {assignment.role}</span>
    </div>
  );
}

function DayBlockCard({
  block,
  active,
  canManageDays,
  canManageCrew,
  onSelect,
  onRemoveDay,
  onUnassignCrew,
}: {
  block: DayBlockView;
  active: boolean;
  canManageDays: boolean;
  canManageCrew: boolean;
  onSelect: () => void;
  onRemoveDay: (dayId: string) => void;
  onUnassignCrew: (dayId: string, crewDayAssignmentId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${block.dateKey}` });
  const classes = ['day-block'];
  if (active) classes.push('day-block-active');
  if (isOver) classes.push('day-block-drag-over');

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
    >
      <div className="day-block-header">
        <span className="day-block-date">
          {formatDayLabel(block.dateKey)}
          {block.day?.name && <span className="day-block-name">{block.day.name}</span>}
        </span>
        {block.itemCount > 0 && (
          <span className="chip chip-neutral">
            {block.itemCount} {block.itemCount === 1 ? 'entry' : 'entries'}
          </span>
        )}
        {canManageDays && block.day && (
          <button
            type="button"
            className="day-block-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveDay(block.day!.id);
            }}
            aria-label="Remove day"
          >
            ×
          </button>
        )}
      </div>
      {(block.day?.callTime || block.day?.wrapTime) && (
        <div className="day-block-times">
          {block.day.callTime && <span>Call {block.day.callTime}</span>}
          {block.day.wrapTime && <span>Wrap ~{block.day.wrapTime}</span>}
        </div>
      )}
      <div className="day-block-crew">
        {(block.day?.crew ?? []).length === 0 ? (
          <span className="muted day-block-crew-empty">Drop crew here</span>
        ) : (
          block.day!.crew.map((c) => (
            <span key={c.id} className="day-block-crew-chip">
              <span className="crew-swatch-dot" style={{ background: resolveCrewColor(c.crewProfileId, c.color) }} />
              {c.displayName}
              {canManageCrew && (
                <button
                  type="button"
                  className="day-block-crew-chip-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnassignCrew(block.day!.id, c.id);
                  }}
                  aria-label={`Remove ${c.displayName} from this day`}
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function AddDayForm({ onAdd }: { onAdd: (dateKey: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="day-block-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value) return;
        onAdd(value);
        setValue('');
      }}
    >
      <input type="date" value={value} onChange={(e) => setValue(e.target.value)} required />
      <button type="submit">+ Add day</button>
    </form>
  );
}

/**
 * The job's day-by-day overview: a draggable crew roster strip, then one block per calendar
 * day (real ones the admin has explicitly added or that already have schedule entries, plus
 * "virtual" placeholder blocks for any schedule-item date that doesn't have a real JobDay row
 * yet - dragging crew onto one of those materializes it on the fly). Clicking a block (not
 * dragging it - blocks are drop targets only, never drag sources, so there's no click/drag
 * ambiguity to resolve) switches which day JobSchedulePanel's hour-by-hour view shows.
 *
 * No DndContext of its own - JobSchedulePanel provides one ambient context wrapping this
 * component AND the hour-by-hour timeline, so a single drag from the roster strip here can
 * land on either a day block or a specific schedule item ("task") in the other half of the
 * split view.
 */
export default function DayBlocksColumn({
  blocks,
  roster,
  selectedDate,
  onSelectDate,
  canManageDays,
  canManageCrew,
  onAddDay,
  onRemoveDay,
  onUnassignCrew,
}: {
  blocks: DayBlockView[];
  roster: JobCrewAssignment[];
  selectedDate: string | null;
  onSelectDate: (key: string) => void;
  canManageDays: boolean;
  canManageCrew: boolean;
  onAddDay: (dateKey: string) => void;
  onRemoveDay: (dayId: string) => void;
  onUnassignCrew: (dayId: string, crewDayAssignmentId: string) => void;
}) {
  return (
    <div className="day-blocks-column">
      <div className="day-blocks-roster">
        <h4>Crew on this job</h4>
        {roster.length === 0 ? (
          <p className="muted">No crew assigned to this job yet - add some on the Crew tab.</p>
        ) : (
          <>
            <p className="muted day-blocks-roster-hint">Drag onto a day or a schedule entry to assign them to it.</p>
            <div className="day-blocks-roster-chips">
              {roster.map((a) => (
                <CrewChip key={a.id} assignment={a} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="day-blocks-list">
        {blocks.length === 0 && <p className="muted">No days yet - add one below, or add a schedule entry.</p>}
        {blocks.map((b) => (
          <DayBlockCard
            key={b.dateKey}
            block={b}
            active={b.dateKey === selectedDate}
            canManageDays={canManageDays}
            canManageCrew={canManageCrew}
            onSelect={() => onSelectDate(b.dateKey)}
            onRemoveDay={onRemoveDay}
            onUnassignCrew={onUnassignCrew}
          />
        ))}
        {canManageDays && <AddDayForm onAdd={onAddDay} />}
      </div>
    </div>
  );
}

/** Thin wrapper so JobSchedulePanel's error-toast-on-failure handling stays identical to before
 * this refactor (the day-level add/remove/unassign calls used to live inside this file). */
export function useDayBlockActions(jobId: string, onChanged: () => void, onSelectDate: (key: string) => void) {
  const { showToast } = useToast();

  const addDay = async (key: string) => {
    try {
      await api.jobDays.create(jobId, localMidnightIso(key));
      onChanged();
      onSelectDate(key);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const removeDay = async (dayId: string) => {
    try {
      await api.jobDays.remove(jobId, dayId);
      onChanged();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const unassignCrew = async (dayId: string, crewDayAssignmentId: string) => {
    try {
      await api.jobDays.unassignCrew(jobId, dayId, crewDayAssignmentId);
      onChanged();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return { addDay, removeDay, unassignCrew };
}
