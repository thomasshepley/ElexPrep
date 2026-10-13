import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { formatDate, formatTime } from '../utils/format';
import type { JobDay } from '../api/client';

export interface TimelineItemCrew {
  id: string;
  crewProfileId: string;
  displayName: string;
  color: string | null;
}

export interface TimelineItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  notes?: string | null;
  location?: string | null;
  color?: string | null;
  crew?: TimelineItemCrew[];
}

const PX_PER_MIN = 1.1;
const MIN_BLOCK_MIN = 30; // a point-in-time entry (no endsAt) still gets a visible block
// The axis runs on into the small hours (to 06:00 next day) for shows that finish after midnight.
const MAX_TIMELINE_MIN = 30 * 60;

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** An entry whose start and end are the same moment - a deadline or info point ("Call time",
 * "Arrive on site") rather than a block of time. */
export function isPointInTime(item: { startsAt: string; endsAt?: string | null }): boolean {
  return Boolean(item.endsAt) && new Date(item.endsAt!).getTime() === new Date(item.startsAt).getTime();
}

/** A full-width line across the timeline at one moment: a point-in-time entry, or a day's
 * call / estimated wrap time. */
export interface DayMarker {
  key: string;
  label: string;
  /** "HH:MM" as shown. */
  time: string;
  startMin: number;
  tone: 'point' | 'call' | 'wrap';
  color?: string | null;
  itemId?: string;
}

function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** A day's call and estimated wrap as timeline markers. A wrap earlier than the call runs past midnight. */
export function dayMarkers(day: Pick<JobDay, 'callTime' | 'wrapTime'> | null | undefined): DayMarker[] {
  if (!day) return [];
  const out: DayMarker[] = [];
  const call = day.callTime ? hhmmToMinutes(day.callTime) : null;
  if (day.callTime && call !== null) out.push({ key: 'call', label: 'Call time', time: day.callTime, startMin: call, tone: 'call' });
  if (day.wrapTime) {
    let wrap = hhmmToMinutes(day.wrapTime);
    if (call !== null && wrap < call) wrap += 24 * 60;
    out.push({ key: 'wrap', label: 'Estimated wrap', time: day.wrapTime, startMin: Math.min(wrap, MAX_TIMELINE_MIN), tone: 'wrap' });
  }
  return out;
}

/** "Prep Day · Call 08:00 · Wrap ~23:00" - whichever parts the day has. */
export function daySummary(day: Pick<JobDay, 'name' | 'callTime' | 'wrapTime'> | null | undefined): string {
  if (!day) return '';
  return [day.name, day.callTime && `Call ${day.callTime}`, day.wrapTime && `Wrap ~${day.wrapTime}`].filter(Boolean).join(' · ');
}


/** A translucent wash of the item's own color, roughly matching --accent-wash's opacity, so a
 * colored item reads the same "tinted block, solid left border" look the default accent color
 * already uses instead of a flat solid fill. */
function colorWash(hex: string): string | undefined {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return undefined;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

/** Also used by JobSchedulePanel/DayBlocksColumn to match schedule items to day blocks - always
 * bucket by local calendar day (not UTC), consistent with how the hour-by-hour view below
 * already splits a multi-day job's items. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TimedItem extends TimelineItem {
  startMin: number;
  endMin: number;
}

interface LaidOutItem extends TimedItem {
  col: number;
  colCount: number;
}

/**
 * Assigns each item a column (and the column count of its overlap cluster) so entries whose
 * times overlap render side by side instead of stacked on top of each other - the same
 * layout Google Calendar's day view uses. `items` must already be sorted by start time, and
 * must all belong to the same calendar day - see DayTimeline below, which groups by date
 * before calling this, since two items on different days are never really "overlapping" even
 * if they happen to share the same time-of-day.
 */
function layoutColumns(items: TimedItem[]): LaidOutItem[] {
  // Split into overlap clusters first: a sweep over start-sorted items where an item starting
  // at or after the running max end-so-far can't overlap anything already in the cluster.
  const clusters: TimedItem[][] = [];
  let current: TimedItem[] = [];
  let clusterEnd = -Infinity;
  for (const item of items) {
    if (current.length > 0 && item.startMin >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (current.length > 0) clusters.push(current);

  const result: LaidOutItem[] = [];
  for (const cluster of clusters) {
    // Greedy column assignment within the cluster: each column remembers the end time of the
    // last item placed in it; an item reuses the first column that's already free by its start.
    const columnEnds: number[] = [];
    const placements: { item: TimedItem; col: number }[] = [];
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[col] = item.endMin;
      }
      placements.push({ item, col });
    }
    const colCount = columnEnds.length;
    for (const { item, col } of placements) result.push({ ...item, col, colCount });
  }
  return result;
}

interface ItemBlockProps {
  item: LaidOutItem;
  style: React.CSSProperties;
  canManageCrew?: boolean;
  onUnassignCrew?: (itemId: string, crewRowId: string) => void;
  onOpen?: (itemId: string) => void;
  /** The viewer's own entry (crew portal): drawn in purple so their slots stand out. */
  isMine?: boolean;
}

/** Click / Enter / Space on a block opens its details, without stealing clicks on its own buttons. */
function openProps(item: LaidOutItem, onOpen?: (id: string) => void) {
  if (!onOpen) return {};
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': `${item.title}, ${formatTime(new Date(item.startsAt))} - open details`,
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      onOpen(item.id);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
        e.preventDefault();
        onOpen(item.id);
      }
    },
  };
}

function ItemBody({ item, canManageCrew, onUnassignCrew }: Pick<ItemBlockProps, 'item' | 'canManageCrew' | 'onUnassignCrew'>) {
  const start = new Date(item.startsAt);
  const end = item.endsAt ? new Date(item.endsAt) : null;
  return (
    <>
      <div className="day-timeline-item-time" style={{ color: item.color ?? undefined }}>
        {formatTime(start)}
        {end && ` – ${formatTime(end)}`}
      </div>
      <div className="day-timeline-item-title">{item.title}</div>
      {item.location && <div className="day-timeline-item-notes">{item.location}</div>}
      {item.notes && <div className="day-timeline-item-notes">{item.notes}</div>}
      {item.crew && item.crew.length > 0 && (
        <div className="day-timeline-item-crew">
          {item.crew.map((c) => (
            <span key={c.id} className="day-block-crew-chip">
              <span className="crew-swatch-dot" style={{ background: c.color ?? 'var(--accent)' }} />
              {c.displayName}
              {canManageCrew && onUnassignCrew && (
                <button
                  type="button"
                  className="day-block-crew-chip-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnassignCrew(item.id, c.id);
                  }}
                  aria-label={`Remove ${c.displayName} from this task`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** A plain (non-drop-target) item block - used by the crew portal's read-only timeline. */
function PlainItemBlock({ item, style, canManageCrew, onUnassignCrew, onOpen, isMine }: ItemBlockProps) {
  return (
    <div className={`day-timeline-item${isMine ? ' is-mine' : ''}${onOpen ? ' is-openable' : ''}`} style={style} {...openProps(item, onOpen)}>
      <ItemBody item={item} canManageCrew={canManageCrew} onUnassignCrew={onUnassignCrew} />
    </div>
  );
}

/** A drop-target item block - used by the admin Schedule tab so crew can be dragged onto a
 * specific task, not just a whole day. */
function DroppableItemBlock({ item, style, canManageCrew, onUnassignCrew, onOpen }: ItemBlockProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `task:${item.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`day-timeline-item${isOver ? ' day-timeline-item-drag-over' : ''}${onOpen ? ' is-openable' : ''}`}
      style={style}
      {...openProps(item, onOpen)}
    >
      <ItemBody item={item} canManageCrew={canManageCrew} onUnassignCrew={onUnassignCrew} />
    </div>
  );
}

/** A single day's Google-Calendar-day-view-style vertical timeline. `items` must all fall on
 * the same calendar day - DayTimeline (below) handles splitting a multi-day job's items into
 * one of these per day. `dropTargets` makes each item a dnd-kit drop target (for dragging crew
 * onto a task - see JobSchedulePanel, which provides the ambient DndContext this relies on);
 * leave it off for a read-only view (the crew portal's mirror). */
export function SingleDayTimeline({
  items,
  dropTargets = false,
  canManageCrew = false,
  onUnassignCrew,
  onOpen,
  myCrewProfileId,
  markers: dayLevelMarkers = [],
}: {
  items: TimelineItem[];
  dropTargets?: boolean;
  canManageCrew?: boolean;
  onUnassignCrew?: (itemId: string, crewRowId: string) => void;
  onOpen?: (itemId: string) => void;
  myCrewProfileId?: string | null;
  /** The day's call / wrap lines (see dayMarkers). */
  markers?: DayMarker[];
}) {
  const markers: DayMarker[] = [
    ...dayLevelMarkers,
    ...items.filter(isPointInTime).map((item) => {
      const start = new Date(item.startsAt);
      return { key: item.id, itemId: item.id, label: item.title, time: formatTime(start), startMin: minutesSinceMidnight(start), tone: 'point' as const, color: item.color };
    }),
  ].sort((a, b) => a.startMin - b.startMin);
  const sorted = items
    .filter((item) => !isPointInTime(item))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const timed: TimedItem[] = sorted.map((item) => {
    const startMin = minutesSinceMidnight(new Date(item.startsAt));
    // Duration-based rather than end-of-day-based, so an entry running past midnight
    // (22:00-01:00) keeps its real length instead of wrapping to a 30-minute stub.
    const durationMin = item.endsAt ? (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000 : 0;
    const endMin = Math.min(startMin + Math.max(durationMin, MIN_BLOCK_MIN), MAX_TIMELINE_MIN);
    return { ...item, startMin, endMin };
  });
  const laidOut = layoutColumns(timed);

  if (timed.length === 0 && markers.length === 0) return null;
  const starts = [...timed.map((i) => i.startMin), ...markers.map((m) => m.startMin)];
  const ends = [...timed.map((i) => i.endMin), ...markers.map((m) => m.startMin + 30)];
  const dayStartHour = Math.max(0, Math.floor(Math.min(...starts) / 60) - 1);
  const dayEndHour = Math.min(MAX_TIMELINE_MIN / 60, Math.ceil(Math.max(...ends) / 60) + 1);
  const hours = Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => dayStartHour + i);
  const totalHeight = (dayEndHour - dayStartHour) * 60 * PX_PER_MIN;

  const ItemBlock = dropTargets ? DroppableItemBlock : PlainItemBlock;

  return (
    <div className="day-timeline" style={{ height: totalHeight }}>
      {hours.map((h) => (
        <div key={h} className="day-timeline-hour" style={{ top: (h - dayStartHour) * 60 * PX_PER_MIN }}>
          <span className="day-timeline-hour-label">{String(h % 24).padStart(2, '0')}:00</span>
          <div className="day-timeline-hour-line" />
        </div>
      ))}
      <div className="day-timeline-track">
        {laidOut.map((item) => {
          const top = (item.startMin - dayStartHour * 60) * PX_PER_MIN;
          const durationMin = item.endMin - item.startMin;
          const widthPct = 100 / item.colCount;
          const wash = item.color ? colorWash(item.color) : undefined;
          return (
            <ItemBlock
              key={item.id}
              item={item}
              canManageCrew={canManageCrew}
              onUnassignCrew={onUnassignCrew}
              onOpen={onOpen}
              isMine={Boolean(myCrewProfileId && item.crew?.some((c) => c.crewProfileId === myCrewProfileId))}
              style={{
                top,
                minHeight: durationMin * PX_PER_MIN,
                left: `${item.col * widthPct}%`,
                width: `calc(${widthPct}% - 6px)`,
                ...(wash && !(myCrewProfileId && item.crew?.some((c) => c.crewProfileId === myCrewProfileId))
                  ? { background: wash, borderLeftColor: item.color! }
                  : {}),
              }}
            />
          );
        })}
        {markers.map((m) => {
          const item = m.itemId ? items.find((i) => i.id === m.itemId) : undefined;
          const open = item && onOpen ? openProps({ ...item, startMin: m.startMin, endMin: m.startMin, col: 0, colCount: 1 }, onOpen) : {};
          const mine = Boolean(myCrewProfileId && item?.crew?.some((c) => c.crewProfileId === myCrewProfileId));
          return (
            <div
              key={m.key}
              className={`day-timeline-marker tone-${m.tone}${mine ? ' is-mine' : ''}${item && onOpen ? ' is-openable' : ''}`}
              style={{ top: (m.startMin - dayStartHour * 60) * PX_PER_MIN, ...(m.color ? ({ '--marker-color': m.color } as React.CSSProperties) : {}) }}
              {...open}
            >
              <span className="day-timeline-marker-pill">
                <span className="day-timeline-marker-time">{m.time}</span>
                {m.label}
                {item?.location && <span className="day-timeline-marker-extra"> · {item.location}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A job's day-by-day schedule, split into one calendar day per tab. Items are laid out by
 * minutes-since-midnight within a day (see SingleDayTimeline/layoutColumns), which only makes
 * sense when every item being compared actually falls on the same date - grouping by date
 * first (rather than rendering every item from every day on one shared time axis, as this
 * component used to) is what stops a multi-day job's entries from appearing to overlap just
 * because e.g. "Load in" on day 1 and "Show" on day 2 both start at 09:00.
 */
export default function DayTimeline({
  items,
  onOpen,
  myCrewProfileId,
  jobDays = [],
}: {
  items: TimelineItem[];
  onOpen?: (itemId: string) => void;
  myCrewProfileId?: string | null;
  /** The job's days, for each tab's name and the call / wrap lines. */
  jobDays?: JobDay[];
}) {
  const dayByKey = useMemo(() => new Map(jobDays.map((d) => [dateKey(new Date(d.date)), d])), [jobDays]);
  const days = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    // A day with a call time shows even before anything else is scheduled on it.
    for (const [key, day] of dayByKey) if (day.callTime || day.wrapTime) map.set(key, []);
    for (const item of items) {
      const key = dateKey(new Date(item.startsAt));
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, dayByKey]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected && days.some(([key]) => key === selected) ? selected : days[0]?.[0] ?? null;
  const activeItems = days.find(([key]) => key === activeKey)?.[1] ?? [];

  if (days.length === 0) {
    return <p className="muted">No schedule has been set for this job yet.</p>;
  }
  const activeDay = activeKey ? dayByKey.get(activeKey) : undefined;

  return (
    <div>
      {days.length > 1 && (
        <div className="row" style={{ gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {days.map(([key]) => (
            <button
              key={key}
              className={key === activeKey ? '' : 'secondary'}
              onClick={() => setSelected(key)}
            >
              {formatDate(`${key}T00:00:00`)}
              {dayByKey.get(key)?.name && <span className="day-tab-name"> · {dayByKey.get(key)!.name}</span>}
            </button>
          ))}
        </div>
      )}
      {activeDay && daySummary(activeDay) && <p className="day-summary">{daySummary(activeDay)}</p>}
      {activeKey && <SingleDayTimeline items={activeItems} onOpen={onOpen} myCrewProfileId={myCrewProfileId} markers={dayMarkers(activeDay)} />}
      {myCrewProfileId && <p className="muted day-timeline-legend"><span className="day-timeline-mine-swatch" /> Your slots</p>}
    </div>
  );
}
