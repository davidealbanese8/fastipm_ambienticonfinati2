import { useState } from 'react';
import type { TimeSlot } from '../../types';
import {
  AvailabilityGrid,
  ROLE_LABELS,
  type AvailabilityPerson,
  type AvailabilityRole,
  type CalendarVariant,
} from './AvailabilityGrid';
import styles from './AvailabilityDrawer.module.css';

const VARIANTS: { variant: CalendarVariant; label: string }[] = [
  { variant: 'base', label: 'Base' },
  { variant: 'ruler', label: 'A' },
  { variant: 'detail', label: 'B' },
];

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
  initialVariant = 'base',
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
  initialVariant?: CalendarVariant;
  onAssign: (personName: string, day: string, slot: TimeSlot) => void;
  onClose: () => void;
}) {
  const labels = ROLE_LABELS[role];
  // The proposed-slot and conflict highlights only mean something where an appointment is
  // actually being placed, which is here — so the variant switch is repeated in the drawer
  // rather than living only on the Calendario globale page.
  const [variant, setVariant] = useState<CalendarVariant>(initialVariant);

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
          <div className={styles.variantSwitch} role="tablist" aria-label="Versione del calendario">
            {VARIANTS.map((v) => (
              <button
                key={v.variant}
                type="button"
                role="tab"
                aria-selected={variant === v.variant}
                className={variant === v.variant ? styles.variantBtnActive : styles.variantBtn}
                onClick={() => setVariant(v.variant)}
              >
                {v.label}
              </button>
            ))}
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
          variant={variant}
          onAssign={onAssign}
        />
      </div>
    </div>
  );
}
