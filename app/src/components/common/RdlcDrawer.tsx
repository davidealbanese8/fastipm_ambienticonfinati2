import type { Operator, TimeSlot } from '../../types';
import { OperatorAvailability } from './OperatorAvailability';
import styles from './RdlcDrawer.module.css';

export function RdlcDrawer({
  operators,
  currentOperatorName,
  cameretta,
  targetDay,
  onAssign,
  onClose,
}: {
  operators: Operator[];
  currentOperatorName: string;
  cameretta?: string;
  targetDay?: string;
  onAssign: (operatorName: string, day: string, slot: TimeSlot) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Disponibilità operatori</h2>
            {cameretta && (
              <div className={styles.subtitle}>
                {cameretta}
                {targetDay ? ` · appuntamento ${targetDay}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>

        <OperatorAvailability
          operators={operators}
          currentOperatorName={currentOperatorName}
          targetDay={targetDay}
          onAssign={onAssign}
        />
      </div>
    </div>
  );
}
