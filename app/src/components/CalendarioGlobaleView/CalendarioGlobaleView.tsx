import { useMemo, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { AvailabilityGrid, type AvailabilityRole } from '../common/AvailabilityGrid';
import { OPERATORE_NAMES } from '../../logic/operators';
import styles from './CalendarioGlobaleView.module.css';

const VIEWS: { role: AvailabilityRole; label: string }[] = [
  { role: 'rdlc', label: 'RDLC' },
  { role: 'operatore', label: 'Operatori' },
];

/** Read-only, global version of the same availability grid used by the assignment drawers —
 *  same filters, same look, just without an onAssign. Opens on the RDLC calendar and can be
 *  switched to the Operatori one; the two cover different people and different appointment
 *  fields, so they are separate views rather than one merged grid. */
export function CalendarioGlobaleView() {
  const { operators } = useAppState();
  const dispatch = useAppDispatch();
  const [role, setRole] = useState<AvailabilityRole>('rdlc');

  const operatori = useMemo(() => OPERATORE_NAMES.map((name) => ({ name })), []);
  const people = role === 'rdlc' ? operators : operatori;

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
          <CaretLeft size={18} />
        </button>
        <h1 className={styles.title}>Calendario globale</h1>
      </div>

      <AvailabilityGrid
        role={role}
        people={people}
        roleSwitch={
          <div className={styles.viewSwitch} role="tablist" aria-label="Vista calendario">
            {VIEWS.map((v) => (
              <button
                key={v.role}
                type="button"
                role="tab"
                aria-selected={role === v.role}
                className={role === v.role ? styles.viewBtnActive : styles.viewBtn}
                onClick={() => setRole(v.role)}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}
