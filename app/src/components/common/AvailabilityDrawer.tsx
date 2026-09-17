import type { TimeSlot } from '../../types';
import { AvailabilityGrid, ROLE_LABELS, type AvailabilityPerson, type AvailabilityRole } from './AvailabilityGrid';
import styles from './AvailabilityDrawer.module.css';

/**
 * Availability drawer for one of the two assignable roles. `role` drives both the title
 * and the grid's occupancy rule, so opening it from the RDLC cell and from the Operatore
 * cell gives two visibly different calendars rather than the same one twice.
 */
export function AvailabilityDrawer({
  role,
  people,
  currentPersonName,
  cameretta,
  targetDay,
  targetSlot,
  onAssign,
  onClose,
}: {
  role: AvailabilityRole;
  people: AvailabilityPerson[];
  currentPersonName: string;
  cameretta?: string;
  targetDay?: string;
  /** The quarter Realizzazione planned — highlighted in the grid, and the slot conflicts
   *  are measured against. */
  targetSlot?: TimeSlot;
  onAssign: (personName: string, day: string, slot: TimeSlot) => void;
  onClose: () => void;
}) {
  const labels = ROLE_LABELS[role];

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Disponibilità {labels.plural}</h2>
            {cameretta && (
              <div className={styles.subtitle}>
                {cameretta}
                {targetDay ? ` · appuntamento ${targetDay}` : ''}
                {targetSlot ? ` ore ${targetSlot}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>

        <AvailabilityGrid
          role={role}
          people={people}
          currentPersonName={currentPersonName}
          targetDay={targetDay}
          targetSlot={targetSlot}
          onAssign={onAssign}
        />
      </div>
    </div>
  );
}
