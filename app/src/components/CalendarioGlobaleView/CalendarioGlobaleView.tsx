import { CaretLeft } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { OperatorAvailability } from '../common/OperatorAvailability';
import styles from './CalendarioGlobaleView.module.css';

/** Read-only, global version of the same operator-availability view used by the RDLC/
 *  Operatore drawer — same filters, same grid, same look, just without an onAssign. */
export function CalendarioGlobaleView() {
  const { operators } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
          <CaretLeft size={18} />
        </button>
        <h1 className={styles.title}>Calendario globale</h1>
      </div>

      <OperatorAvailability operators={operators} />
    </div>
  );
}
