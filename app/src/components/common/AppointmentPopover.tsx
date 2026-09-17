import { createPortal } from 'react-dom';
import { Warning } from '@phosphor-icons/react';
import type { AppointmentStatus, TimeSlot } from '../../types';
import { formatSlotRange, slotsInHour } from '../../logic/timeSlots';
import { StatusPill } from './StatusPill';
import styles from './AppointmentPopover.module.css';

export interface PopoverAppt {
  protocollo: string;
  slot: TimeSlot;
  stato: AppointmentStatus;
}

/**
 * The detail of one hour cell: which quarters are taken, by which RC, in which state, and
 * which are still free.
 *
 * Replaces the native `title` tooltip the grid used to carry. That tooltip could only
 * render one run-on line, appeared on the browser's own delay, and was unreachable by
 * keyboard — so the one case that actually needs reading, several appointments stacked in
 * the same hour, was the case it served worst.
 *
 * Opens on hover and stays open while the pointer is over either the cell or the panel, so
 * its contents can be reached; a click pins it, which is what makes the quarter buttons
 * usable.
 */
export function AppointmentPopover({
  personName,
  day,
  hour,
  appts,
  rect,
  pinned,
  proposedSlot,
  onAssign,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  personName: string;
  day: string;
  hour: number;
  appts: PopoverAppt[];
  rect: { top: number; left: number; width: number };
  pinned: boolean;
  /** The slot Realizzazione asked for, when it falls inside this hour. */
  proposedSlot?: TimeSlot;
  /** Omit for a read-only view: the quarters are then listed but not actionable. */
  onAssign?: (slot: TimeSlot) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const quarters = slotsInHour(hour);
  const busyBySlot = new Map<TimeSlot, PopoverAppt[]>();
  for (const a of appts) {
    const existing = busyBySlot.get(a.slot);
    if (existing) existing.push(a);
    else busyBySlot.set(a.slot, [a]);
  }
  const freeQuarters = quarters.filter((q) => !busyBySlot.has(q));

  return createPortal(
    <div
      className={styles.panel}
      style={{ position: 'fixed', top: rect.top, left: rect.left, minWidth: Math.max(rect.width, 232) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      aria-label={`Appuntamenti di ${personName} il ${day} alle ${String(hour).padStart(2, '0')}`}
    >
      <div className={styles.header}>
        <div>
          <div className={styles.person}>{personName}</div>
          <div className={styles.when}>
            {day} · ore {String(hour).padStart(2, '0')}
          </div>
        </div>
        {pinned && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        )}
      </div>

      {appts.length === 0 ? (
        <div className={styles.emptyNote}>Nessun impegno in questa fascia.</div>
      ) : (
        <ul className={styles.list}>
          {quarters
            .filter((q) => busyBySlot.has(q))
            .flatMap((q) =>
              (busyBySlot.get(q) ?? []).map((a, i) => (
                <li key={`${q}-${a.protocollo}-${i}`} className={styles.item}>
                  <span className={styles.itemTime}>{formatSlotRange(a.slot)}</span>
                  <span className={styles.itemProtocollo}>{a.protocollo}</span>
                  <StatusPill status={a.stato} level="appointment" />
                </li>
              ))
            )}
        </ul>
      )}

      {/* A booked quarter that is also the one Realizzazione asked for is the whole reason
          someone opens this panel: it is the clash they have to resolve. */}
      {proposedSlot && busyBySlot.has(proposedSlot) && (
        <div className={styles.conflict}>
          <Warning size={14} weight="fill" />
          <span>
            Conflitto: {personName.split(' ')[0]} è già impegnato alle {proposedSlot}, l’orario proposto da
            Realizzazione.
          </span>
        </div>
      )}

      <div className={styles.quarters}>
        <span className={styles.quartersLabel}>Quarti d’ora</span>
        <div className={styles.quartersRow}>
          {quarters.map((q) => {
            const busy = busyBySlot.has(q);
            const isProposed = q === proposedSlot;
            const cls = [busy ? styles.qBusy : styles.qFree, isProposed ? styles.qProposed : '']
              .filter(Boolean)
              .join(' ');
            // Live as soon as the panel is open, pinned or not: reaching a quarter already
            // takes a deliberate move into the panel, and requiring a click on the cell
            // first put an extra step in front of the one action the panel exists for.
            const actionable = !!onAssign && !busy;
            return (
              <button
                key={q}
                type="button"
                className={cls}
                disabled={!actionable}
                onClick={() => onAssign?.(q)}
                title={busy ? `Occupato · ${formatSlotRange(q)}` : `Libero · ${formatSlotRange(q)}`}
              >
                {q.slice(3)}
              </button>
            );
          })}
        </div>
        {onAssign && freeQuarters.length > 0 && (
          <div className={styles.hint}>
            Clicca un quarto libero: assegna {personName.split(' ')[0]} a quell’ora e chiude il calendario.
          </div>
        )}
        {onAssign && freeQuarters.length === 0 && (
          <div className={styles.hint}>Nessun quarto libero in questa fascia.</div>
        )}
      </div>
    </div>,
    document.body
  );
}
