import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaretLeft, CaretRight, Star, Warning } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { formatDate } from '../../logic/dates';
import { AREAS } from '../../logic/operators';
import type { AppointmentStatus, AreaFw, TimeSlot } from '../../types';
import { getStatusColor } from '../../tokens';
import { WORK_HOURS, compactTime, hourOf, slotsInHour } from '../../logic/timeSlots';
import { Combobox, type ComboboxOption } from './Combobox';
import { AppointmentPopover } from './AppointmentPopover';
import { DatePickerPopover } from './DatePickerPopover';
import styles from './AvailabilityGrid.module.css';

const STATUS_FILTERS = ['Tutti', 'Da Confermare', 'Da Rimodulare', 'Confermato'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Chip label only — "Confermato" always reads as "Appuntamentato" at the appointment
 *  level, same wording used everywhere else (StatusPill); the filter still matches on
 *  the underlying "Confermato" stato. */
function statusFilterLabel(s: StatusFilter): string {
  return s === 'Confermato' ? 'Appuntamentato' : s;
}

const AREA_FILTERS = ['Tutti', ...AREAS] as const;
type AreaFilter = (typeof AREA_FILTERS)[number];

// Most-urgent-first: a cell with several appointments takes the color of whichever
// status most needs attention, so busy cells read consistently with StatusPill colors
// used everywhere else in the app.
const STATUS_PRIORITY: AppointmentStatus[] = ['Da Confermare', 'Da Rimodulare', 'Da Completare', 'Confermato'];

function dominantStatus(appts: CellAppt[]): AppointmentStatus | undefined {
  for (const s of STATUS_PRIORITY) {
    if (appts.some((a) => a.stato === s)) return s;
  }
  return undefined;
}


interface CellAppt {
  protocollo: string;
  slot: TimeSlot;
  stato: AppointmentStatus;
}

/** Which of the two roles this grid is showing. They are different people pools filling
 *  different appointment fields, so a cell is "busy" for different reasons in each. */
export type AvailabilityRole = 'rdlc' | 'operatore';

/** How many days the grid shows at once. All odd, so the anchored day sits dead centre. */
export const DAY_SPANS = [3, 5, 7] as const;
export type DaySpan = (typeof DAY_SPANS)[number];

function daysFrom(anchor: Date, count: number): Date[] {
  // Always centred on the anchor — which is the day Realizzazione proposed whenever there
  // is one. Snapping to the Monday of its week used to push the proposal to an edge, or
  // off screen entirely once the span narrowed.
  const start = new Date(anchor);
  start.setDate(start.getDate() - Math.floor((count - 1) / 2));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** A person on the grid. `area` only exists for RDLC — Operatore is area-independent. */
export interface AvailabilityPerson {
  name: string;
  area?: AreaFw;
}

export const ROLE_LABELS: Record<AvailabilityRole, { singular: string; plural: string; search: string; empty: string }> = {
  rdlc: {
    singular: 'RDLC',
    plural: 'RDLC',
    search: 'Cerca RDLC',
    empty: 'Nessun RDLC trovato.',
  },
  operatore: {
    singular: 'Operatore',
    plural: 'Operatori',
    search: 'Cerca operatore',
    empty: 'Nessun operatore trovato.',
  },
};

/**
 * People × week-of-days × hour grid with occupancy, shared by the RDLC drawer, the
 * Operatore drawer and the (read-only) Calendario globale page.
 *
 * `role` is not cosmetic: it decides which appointment field marks a cell busy. The same
 * person can appear in both roles, and counting an RDLC's remote-assist shifts against
 * their field availability (or vice versa) would misreport who is free.
 */
export function AvailabilityGrid({
  role,
  people,
  currentPersonName,
  targetDay,
  targetSlot,
  onAssign,
  roleSwitch,
}: {
  role: AvailabilityRole;
  people: AvailabilityPerson[];
  currentPersonName?: string;
  targetDay?: string;
  /** The quarter Realizzazione planned for the appointment being placed. Together with
   *  targetDay it is the slot to beat: the grid highlights it and flags whoever is already
   *  busy there. */
  targetSlot?: TimeSlot;
  /** Omit for a read-only view (Calendario globale): hour cells then just show occupancy. */
  onAssign?: (personName: string, day: string, slot: TimeSlot) => void;
  /** Optional control rendered at the head of the filter row, immediately left of the
   *  search field — the caller owns the role state, the grid only places it. */
  roleSwitch?: ReactNode;
}) {
  const { tasks } = useAppState();
  const labels = ROLE_LABELS[role];
  // Area only partitions the RDLC pool; Operatore is area-independent, so the filter is
  // hidden there rather than shown with a single meaningless "Tutti".
  const showAreaFilter = role === 'rdlc';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Tutti');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('Tutti');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(() => {
    if (targetDay) {
      const [dd, mm, yyyy] = targetDay.split('/');
      if (dd && mm && yyyy) return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
    return new Date();
  });
  const [jumpDate, setJumpDate] = useState('');
  // Narrow by default: three days put the proposed one in the middle with a day either
  // side, which is the comparison actually being made, and leaves the cells wide enough
  // to read the time inside them.
  const [dayCount, setDayCount] = useState<DaySpan>(3);
  // Version B's detail panel. Hover opens it, a click pins it; `pinned` is what makes the
  // quarter buttons live, so a commitment is never one stray pointer-drift away.
  const [detailCell, setDetailCell] = useState<{
    person: string;
    day: string;
    hour: number;
    rect: { top: number; left: number; width: number };
    pinned: boolean;
  } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  /** Delayed so the pointer can cross the gap between the cell and the panel. */
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setDetailCell((c) => (c?.pinned ? c : null)), 160);
  }

  useEffect(() => cancelClose, []);

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const days = useMemo(() => daysFrom(anchor, dayCount), [anchor, dayCount]);
  const proposedHour = targetSlot ? hourOf(targetSlot) : undefined;
  // The column count is data-driven (4, 5 or 7), so it can't live in the stylesheet.
  const gridColumns = { gridTemplateColumns: `180px repeat(${dayCount}, 1fr)` };

  const filtered = people.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (!showAreaFilter || areaFilter === 'Tutti' || p.area === areaFilter)
  );

  const searchSuggestions: ComboboxOption[] = filtered.slice(0, 8).map((p) => ({ value: p.name, label: p.name }));

  /**
   * Every booked quarter, indexed by person|day|slot, built once per task change.
   *
   * Two things this fixes over the previous per-cell scan:
   *  - cost: that scan walked every task × appointment for each of the ~1100 cells on
   *    screen, so the work grew with grid area rather than with the data;
   *  - truth: it also applied statusFilter while deciding occupancy, so filtering by one
   *    status made slots booked under another status render as free — in the assignment
   *    drawers that invites booking straight over an existing appointment. Occupancy is
   *    now absolute and statusFilter only changes emphasis (see isMuted below).
   */
  const bookedIndex = useMemo(() => {
    const index = new Map<string, CellAppt[]>();
    for (const t of allTasks) {
      for (const a of t.appointments) {
        // Busy *in this role only*: the RDLC grid ignores the person's remote-assist
        // shifts and the Operatore grid ignores their field work, so each grid answers
        // "is this person free to take on more of THIS role".
        const personName = role === 'rdlc' ? a.rdlc : a.operatore;
        if (!personName) continue;
        // The RDLC's own date/slot wins when Sicurezza has set one; otherwise the row is
        // still sitting on the date Realizzazione planned.
        const day = a.dataRdlc || a.dataPianificazione;
        const slot = a.slotRdlc || a.slot;
        const key = `${personName}|${day}|${slot}`;
        const entry: CellAppt = { protocollo: t.protocollo, slot, stato: a.stato };
        const existing = index.get(key);
        if (existing) existing.push(entry);
        else index.set(key, [entry]);
      }
    }
    return index;
  }, [allTasks, role]);

  function apptsAt(personName: string, dayStr: string, slot: string): CellAppt[] {
    return bookedIndex.get(`${personName}|${dayStr}|${slot}`) ?? [];
  }

  /** Whoever is already booked on the exact slot Realizzazione asked for. Picking one of
   *  them means moving the appointment off its requested time, so the grid says so up front
   *  rather than letting it be discovered after the assignment. */
  function hasConflict(personName: string): boolean {
    if (!targetDay || !targetSlot) return false;
    return apptsAt(personName, targetDay, targetSlot).length > 0;
  }

  function cellAppts(personName: string, dayStr: string, hour: number): CellAppt[] {
    const out: CellAppt[] = [];
    for (const slot of slotsInHour(hour)) out.push(...apptsAt(personName, dayStr, slot));
    return out;
  }

  /** Booked, but not the status currently being filtered for: shown greyed, never as free. */
  function isMuted(appts: CellAppt[]): boolean {
    return statusFilter !== 'Tutti' && !appts.some((a) => a.stato === statusFilter);
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.pillRow}>
          <span className={styles.pillRowLabel}>Stato</span>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? styles.pillActive : styles.pill}
              onClick={() => setStatusFilter(s)}
            >
              {statusFilterLabel(s)}
            </button>
          ))}
        </div>

        {showAreaFilter && (
          <div className={styles.pillRow}>
            <span className={styles.pillRowLabel}>Area</span>
            {AREA_FILTERS.map((a) => (
              <button
                key={a}
                type="button"
                className={areaFilter === a ? styles.pillActive : styles.pill}
                onClick={() => setAreaFilter(a)}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        <div className={styles.filters}>
          {roleSwitch}
          <Combobox
            className={styles.searchField}
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder={labels.search}
            aria-label={labels.search}
          />
          <div className={styles.spanSwitch} role="tablist" aria-label="Giorni visibili">
            {DAY_SPANS.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={dayCount === n}
                className={dayCount === n ? styles.spanBtnActive : styles.spanBtn}
                onClick={() => setDayCount(n)}
              >
                {n} gg
              </button>
            ))}
          </div>
          <div className={styles.weekNav}>
            <button
              className={styles.weekNavBtn}
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayCount))}
              aria-label="Giorni precedenti"
            >
              <CaretLeft size={14} />
            </button>
            <span className={styles.weekNavRange}>
              {formatDate(days[0])} – {formatDate(days[days.length - 1])}
            </span>
            <button
              className={styles.weekNavBtn}
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayCount))}
              aria-label="Giorni successivi"
            >
              <CaretRight size={14} />
            </button>
          </div>
          <DatePickerPopover
            value={jumpDate}
            onChange={(v) => {
              setJumpDate(v);
              const [dd, mm, yyyy] = v.split('/');
              if (dd && mm && yyyy) setAnchor(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
            }}
            id="availability-grid-jump"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>{labels.empty}</div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.gridHeaderRow} style={gridColumns}>
            <div className={styles.opCol} />
            {days.map((d) => {
              const dayStr = formatDate(d);
              const isTarget = dayStr === targetDay;
              const isToday = dayStr === todayStr;
              const dayColClasses = [styles.dayCol];
              if (isTarget) dayColClasses.push(styles.dayColTarget);
              if (isToday) dayColClasses.push(styles.dayColToday);
              return (
                <div key={d.toISOString()} className={dayColClasses.join(' ')}>
                  <span>{dayStr}</span>
                  {isToday && <span className={styles.todayBadge}>Oggi</span>}
                </div>
              );
            })}
          </div>
          {filtered.map((op) => (
            <div key={op.name} className={styles.gridRow} style={gridColumns}>
              <div className={styles.opCol}>
                <div className={styles.opName}>
                  {op.name === currentPersonName && <Star size={12} weight="fill" color="#B8720B" />} {op.name}
                </div>
                <div className={styles.opArea}>{op.area ?? labels.singular}</div>
                {hasConflict(op.name) && (
                  <span className={styles.conflictTag} title={`Già impegnato il ${targetDay} alle ${targetSlot}`}>
                    <Warning size={10} weight="fill" /> Occupato all’orario proposto
                  </span>
                )}
              </div>
              {days.map((d) => {
                const dayStr = formatDate(d);
                const isTarget = dayStr === targetDay;
                const isToday = dayStr === todayStr;
                const cellClasses = [styles.cell];
                if (isTarget) cellClasses.push(styles.cellTarget);
                if (isToday) cellClasses.push(styles.cellToday);
                {
                  const isProposedDay = !!targetDay && dayStr === targetDay;
                  return (
                    <div key={d.toISOString()} className={cellClasses.join(' ')}>
                      <div className={styles.hourGrid}>
                        {WORK_HOURS.map((h) => {
                          const appts = cellAppts(op.name, dayStr, h);
                          const muted = isMuted(appts);
                          const dominant = dominantStatus(appts);
                          const color = muted || !dominant ? undefined : getStatusColor(dominant, 'appointment');
                          const isProposedCell = isProposedDay && h === proposedHour;
                          // A clash only exists where Realizzazione's slot actually is.
                          const clash = isProposedCell && !!targetSlot && apptsAt(op.name, dayStr, targetSlot).length > 0;
                          const cls = [
                            appts.length === 0 ? styles.cellBtnFree : muted ? styles.cellBtnMuted : styles.cellBtnBusy,
                            isProposedCell ? styles.cellBtnProposed : '',
                            clash ? styles.cellBtnClash : '',
                          ]
                            .filter(Boolean)
                            .join(' ');
                          const open = (el: HTMLElement, pinned: boolean) => {
                            const r = el.getBoundingClientRect();
                            cancelClose();
                            setDetailCell({
                              person: op.name,
                              day: dayStr,
                              hour: h,
                              rect: { top: r.bottom + 6, left: r.left, width: r.width },
                              pinned,
                            });
                          };
                          return (
                            <button
                              key={h}
                              type="button"
                              className={cls}
                              style={color ? { background: color.bg, color: color.text } : undefined}
                              // A pinned panel is a deliberate choice; drifting the pointer
                              // across other cells must not replace it.
                              onMouseEnter={(e) => {
                                if (detailCell?.pinned) return;
                                open(e.currentTarget, false);
                              }}
                              onMouseLeave={scheduleClose}
                              onFocus={(e) => {
                                if (detailCell?.pinned) return;
                                open(e.currentTarget, false);
                              }}
                              onClick={(e) => open(e.currentTarget, true)}
                            >
                              {/* Busy cells drop the hour label: the time already carries it,
                                  and at ~28px wide printing both gave "10" over "10:45". */}
                              {appts.length === 0 ? (
                                <span className={styles.cellBtnHour}>{String(h).padStart(2, '0')}</span>
                              ) : (
                                <span className={styles.cellBtnLine}>
                                  {/* Several in one hour: the count leads, the first time
                                      follows, and the panel lists them all. Two full times
                                      do not fit side by side. */}
                                  {appts.length > 1 && (
                                    <span className={styles.cellBtnMore} aria-label={`${appts.length} impegni`}>
                                      {appts.length}
                                    </span>
                                  )}
                                  <span className={styles.cellBtnTimes}>{compactTime(appts[0].slot)}</span>
                                </span>
                              )}
                              {clash && <span className={styles.clashDot} aria-label="Conflitto" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          ))}
        </div>
      )}

      {detailCell && (
        <AppointmentPopover
          personName={detailCell.person}
          day={detailCell.day}
          hour={detailCell.hour}
          appts={cellAppts(detailCell.person, detailCell.day, detailCell.hour)}
          rect={detailCell.rect}
          pinned={detailCell.pinned}
          proposedSlot={
            targetSlot && detailCell.day === targetDay && hourOf(targetSlot) === detailCell.hour
              ? targetSlot
              : undefined
          }
          onAssign={onAssign ? (slot) => { onAssign(detailCell.person, detailCell.day, slot); setDetailCell(null); } : undefined}
          onClose={() => setDetailCell(null)}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}

    </div>
  );
}
