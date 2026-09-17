import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, Star } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { formatDate } from '../../logic/dates';
import { AREAS } from '../../logic/operators';
import type { AppointmentStatus, AreaFw, TimeSlot } from '../../types';
import { displayLabel, getStatusColor } from '../../tokens';
import { WORK_HOURS, hourOf, slotsInHour } from '../../logic/timeSlots';
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

function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  const dow = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface CellAppt {
  protocollo: string;
  slot: string;
  stato: string;
}

/** Which of the two roles this grid is showing. They are different people pools filling
 *  different appointment fields, so a cell is "busy" for different reasons in each. */
export type AvailabilityRole = 'rdlc' | 'operatore';

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

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  const todayStr = useMemo(() => formatDate(new Date()), []);

  const filtered = people.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) &&
      (!showAreaFilter || areaFilter === 'Tutti' || p.area === areaFilter)
  );

  const searchSuggestions: ComboboxOption[] = filtered.slice(0, 8).map((p) => ({ value: p.name, label: p.name }));

  function cellAppts(personName: string, dayStr: string, hour: number): CellAppt[] {
    const out: CellAppt[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        // Busy *in this role only*: the RDLC grid ignores the person's remote-assist
        // shifts and the Operatore grid ignores their field work, so each grid answers
        // "is this person free to take on more of THIS role".
        const busy = role === 'rdlc' ? a.rdlc === personName : a.operatore === personName;
        if (!busy) continue;
        if (a.dataPianificazione !== dayStr || hourOf(a.slot) !== hour) continue;
        if (statusFilter !== 'Tutti' && a.stato !== statusFilter) continue;
        out.push({ protocollo: t.protocollo, slot: a.slot, stato: a.stato });
      }
    }
    return out;
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
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}
              aria-label="Settimana precedente"
            >
              <CaretLeft size={14} />
            </button>
            <span className={styles.weekNavRange}>
              {formatDate(days[0])} – {formatDate(days[6])}
            </span>
            <button
              className={styles.weekNavBtn}
              onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}
              aria-label="Settimana successiva"
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
          <div className={styles.gridHeaderRow}>
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
            <div key={op.name} className={styles.gridRow}>
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
                return (
                  <div key={d.toISOString()} className={cellClasses.join(' ')}>
                    <div className={styles.hourGrid}>
                      {WORK_HOURS.map((h) => {
                        const appts = cellAppts(op.name, dayStr, h);
                        const dominant = dominantStatus(appts);
                        const statusColor = dominant ? getStatusColor(dominant, 'appointment') : undefined;
                        return (
                          <button
                            key={h}
                            type="button"
                            className={appts.length > 0 ? styles.cellBtnBusy : styles.cellBtnFree}
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
