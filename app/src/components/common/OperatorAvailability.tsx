import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, Star } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { formatDate } from '../../logic/dates';
import { AREAS } from '../../logic/operators';
import type { AppointmentStatus, Operator, TimeSlot } from '../../types';
import { displayLabel, getStatusColor } from '../../tokens';
import { WORK_HOURS, hourOf, slotsInHour } from '../../logic/timeSlots';
import { Combobox, type ComboboxOption } from './Combobox';
import { DatePickerPopover } from './DatePickerPopover';
import styles from './OperatorAvailability.module.css';

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

/**
 * Operators × week-of-days × hour grid with occupancy, shared by the RDLC/Operatore
 * availability drawer and the (read-only) Calendario globale page — same look, same
 * filters, same interaction.
 */
export function OperatorAvailability({
  operators,
  currentOperatorName,
  targetDay,
  onAssign,
}: {
  operators: Operator[];
  currentOperatorName?: string;
  targetDay?: string;
  /** Omit for a read-only view (Calendario globale): hour cells then just show occupancy. */
  onAssign?: (operatorName: string, day: string, slot: TimeSlot) => void;
}) {
  const { tasks } = useAppState();
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

  const filtered = operators.filter(
    (o) => o.name.toLowerCase().includes(search.toLowerCase()) && (areaFilter === 'Tutti' || o.area === areaFilter)
  );

  const searchSuggestions: ComboboxOption[] = filtered.slice(0, 8).map((o) => ({ value: o.name, label: o.name }));

  function cellAppts(operatorName: string, dayStr: string, hour: number): CellAppt[] {
    const out: CellAppt[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        // An operator can be busy either as RDLC or as the remote-assist Operatore.
        if (a.rdlc !== operatorName && a.operatore !== operatorName) continue;
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

        <div className={styles.filters}>
          <Combobox
            className={styles.searchField}
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca operatore"
            aria-label="Cerca operatore"
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
            id="operator-availability-jump"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>Nessun operatore trovato.</div>
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
                  {op.name === currentOperatorName && <Star size={12} weight="fill" color="#B8720B" />} {op.name}
                </div>
                <div className={styles.opArea}>{op.area}</div>
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
