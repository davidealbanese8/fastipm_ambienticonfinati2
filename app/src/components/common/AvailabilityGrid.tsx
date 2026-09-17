import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, Star } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { formatDate } from '../../logic/dates';
import { AREAS } from '../../logic/operators';
import type { AppointmentStatus, AreaFw, TimeSlot } from '../../types';
import { displayLabel, getStatusColor } from '../../tokens';
import {
  AFTERNOON_HOURS,
  AFTERNOON_SLOTS,
  MORNING_HOURS,
  MORNING_SLOTS,
  WORK_HOURS,
  buildSlotRuns,
  formatSlotRange,
  slotsInHour,
} from '../../logic/timeSlots';
import { Combobox, type ComboboxOption } from './Combobox';
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
  slot: string;
  stato: string;
}

/** Which of the two roles this grid is showing. They are different people pools filling
 *  different appointment fields, so a cell is "busy" for different reasons in each. */
export type AvailabilityRole = 'rdlc' | 'operatore';

/** How a day cell is drawn. See the `variant` prop. */
export type CalendarVariant = 'base' | 'ruler';

// The ruler needs ~200px per day to keep a quarter legible and its time label readable, so
// it trades days for resolution. A short roster (the Operatore pool, or RDLC filtered down
// to one area) leaves room for one more day.
function visibleDayCount(variant: CalendarVariant, peopleCount: number): number {
  if (variant === 'base') return 7;
  return peopleCount <= 8 ? 5 : 4;
}

function daysFrom(anchor: Date, count: number): Date[] {
  // Anchored on the Monday of the anchor's week when a full week fits, otherwise centred
  // on the anchor itself so a jumped-to date stays on screen instead of falling off the end.
  const start = new Date(anchor);
  if (count >= 7) {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else {
    start.setDate(start.getDate() - Math.floor((count - 1) / 2));
  }
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
  onAssign,
  roleSwitch,
  variant = 'base',
}: {
  role: AvailabilityRole;
  people: AvailabilityPerson[];
  currentPersonName?: string;
  targetDay?: string;
  /** Omit for a read-only view (Calendario globale): hour cells then just show occupancy. */
  onAssign?: (personName: string, day: string, slot: TimeSlot) => void;
  /** Optional control rendered at the head of the filter row, immediately left of the
   *  search field — the caller owns the role state, the grid only places it. */
  roleSwitch?: ReactNode;
  /** 'base' = one button per work hour, count badge, quarter picked in a popover.
   *  'ruler' = the day as two continuous 16-quarter strips with booked runs written out. */
  variant?: CalendarVariant;
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
  const [openCell, setOpenCell] = useState<{
    opName: string;
    day: string;
    hour: number;
    rect: { top: number; left: number; width: number };
  } | null>(null);

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  const todayStr = useMemo(() => formatDate(new Date()), []);
  const dayCount = visibleDayCount(variant, people.length);
  const days = useMemo(() => daysFrom(anchor, dayCount), [anchor, dayCount]);
  const isRuler = variant === 'ruler';
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
          <div className={styles.weekNav}>
            <button
              className={styles.weekNavBtn}
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayCount))}
              aria-label={isRuler ? 'Giorni precedenti' : 'Settimana precedente'}
            >
              <CaretLeft size={14} />
            </button>
            <span className={styles.weekNavRange}>
              {formatDate(days[0])} – {formatDate(days[days.length - 1])}
            </span>
            <button
              className={styles.weekNavBtn}
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayCount))}
              aria-label={isRuler ? 'Giorni successivi' : 'Settimana successiva'}
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
                  {/* The ruler is printed once per day column, not once per person row:
                      every strip below shares this geometry, so a time read here holds
                      for all 20 rows and "who is free at 09:30?" becomes a vertical scan. */}
                  {isRuler && (
                    <div className={styles.ruler} aria-hidden="true">
                      <div className={styles.rulerStrip}>
                        {MORNING_HOURS.map((h) => (
                          <span key={h} className={styles.rulerHour}>
                            {String(h).padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                      <div className={styles.rulerStrip}>
                        {AFTERNOON_HOURS.map((h) => (
                          <span key={h} className={styles.rulerHour}>
                            {String(h).padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
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
              </div>
              {days.map((d) => {
                const dayStr = formatDate(d);
                const isTarget = dayStr === targetDay;
                const isToday = dayStr === todayStr;
                const cellClasses = [styles.cell];
                if (isTarget) cellClasses.push(styles.cellTarget);
                if (isToday) cellClasses.push(styles.cellToday);
                if (isRuler) {
                  return (
                    <div key={d.toISOString()} className={cellClasses.join(' ')}>
                      {[MORNING_SLOTS, AFTERNOON_SLOTS].map((stripSlots, stripIdx) => {
                        const runs = buildSlotRuns(
                          stripSlots,
                          (slot) => apptsAt(op.name, dayStr, slot).length > 0
                        );
                        return (
                          <div key={stripIdx} className={styles.strip}>
                            {/* Quarter ticks: the free surface. They carry the geometry —
                                16 equal cells — so a run's chip can be positioned by index. */}
                            {stripSlots.map((slot) => (
                              <span
                                key={slot}
                                className={styles.tick}
                                title={`${op.name} · ${dayStr} · ${formatSlotRange(slot)}`}
                              />
                            ))}
                            {runs.map((run) => {
                              const appts = run.slots.flatMap((s) => apptsAt(op.name, dayStr, s));
                              const dominant = dominantStatus(appts);
                              const color = dominant ? getStatusColor(dominant, 'appointment') : undefined;
                              const muted = isMuted(appts);
                              return (
                                <span
                                  key={run.slots[0]}
                                  className={muted ? styles.runMuted : styles.run}
                                  style={{
                                    left: `${(run.startIndex / stripSlots.length) * 100}%`,
                                    width: `${(run.length / stripSlots.length) * 100}%`,
                                    ...(muted || !color ? {} : { background: color.bg, color: color.text }),
                                  }}
                                  title={appts
                                    .map(
                                      (a) =>
                                        `${a.protocollo} · ${formatSlotRange(a.slot)} · ${displayLabel(
                                          a.stato as AppointmentStatus,
                                          'appointment'
                                        )}`
                                    )
                                    .join('\n')}
                                >
                                  {/* The written time is the whole point of this variant, so it
                                      gets the chip to itself. A count badge was tried here and
                                      cut into the range label at every size that fit four days;
                                      a merged run already reads as "busy from X to Y", which is
                                      what availability turns on, and the per-appointment detail
                                      is in the tooltip. */}
                                  <span className={styles.runLabel}>{run.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div key={d.toISOString()} className={cellClasses.join(' ')}>
                    <div className={styles.hourGrid}>
                      {WORK_HOURS.map((h) => {
                        const appts = cellAppts(op.name, dayStr, h);
                        const muted = isMuted(appts);
                        const dominant = dominantStatus(appts);
                        const statusColor = muted || !dominant ? undefined : getStatusColor(dominant, 'appointment');
                        return (
                          <button
                            key={h}
                            type="button"
                            className={
                              appts.length === 0
                                ? styles.cellBtnFree
                                : muted
                                  ? styles.cellBtnMuted
                                  : styles.cellBtnBusy
                            }
                            style={statusColor ? { background: statusColor.bg, color: statusColor.text } : undefined}
                            disabled={!onAssign}
                            onClick={(e) => {
                              if (!onAssign) return;
                              const r = e.currentTarget.getBoundingClientRect();
                              setOpenCell({
                                opName: op.name,
                                day: dayStr,
                                hour: h,
                                rect: { top: r.bottom + 4, left: r.left, width: r.width },
                              });
                            }}
                            title={
                              appts.length > 0
                                ? appts.map((a) => `${a.protocollo} (${displayLabel(a.stato as AppointmentStatus, 'appointment')})`).join(', ')
                                : 'Libero'
                            }
                          >
                            <span className={styles.cellBtnHour}>{String(h).padStart(2, '0')}</span>
                            {appts.length > 0 && <span className={styles.cellBtnStatus}>{appts.length} imp.</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Rendered as a portal + position:fixed overlay so opening it never pushes the
          grid's rows down — it floats above everything else instead. */}
      {openCell &&
        onAssign &&
        createPortal(
          <>
            <div className={styles.slotPopoverScrim} onClick={() => setOpenCell(null)} />
            <div
              className={styles.slotPopover}
              style={{
                position: 'fixed',
                top: openCell.rect.top,
                left: openCell.rect.left,
                minWidth: openCell.rect.width,
              }}
            >
              {slotsInHour(openCell.hour).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.slotBtn}
                  onClick={() => {
                    onAssign(openCell.opName, openCell.day, s);
                    setOpenCell(null);
                  }}
                >
                  {s}
                </button>
              ))}
              <button type="button" className={styles.slotPopoverClose} onClick={() => setOpenCell(null)}>
                Chiudi
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
