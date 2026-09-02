import { useState } from 'react';
import { GearSix } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { Toast } from '../common/Toast';
import { ErrorModal } from '../common/ErrorModal';
import { NotesModal } from '../common/NotesModal';
import { ListView } from '../ListView/ListView';
import { DetailView } from '../DetailView/DetailView';
import { CalendarioGlobaleView } from '../CalendarioGlobaleView/CalendarioGlobaleView';
import { RiassegnaView } from '../RiassegnaView/RiassegnaView';
import styles from './AppShell.module.css';

export function AppShell() {
  const { role, view } = useAppState();
  const dispatch = useAppDispatch();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoBadge}>🦋</span>
          <span className={styles.wordmark}>
            FAST<span className={styles.wordmarkAccent}>ipm</span>
          </span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} aria-label="Impostazioni" title="Impostazioni">
            <GearSix size={20} />
          </button>
          <div className={styles.avatarWrap}>
            <button
              className={styles.avatarBtn}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {role === 'realizzazione' ? 'R' : 'S'}
            </button>
            {menuOpen && (
              <div className={styles.dropdown} role="menu">
                <button
                  className={styles.dropdownItem}
                  role="menuitem"
                  onClick={() => {
                    dispatch({ type: 'SET_ROLE', role: role === 'realizzazione' ? 'sicurezza' : 'realizzazione' });
                    setMenuOpen(false);
                  }}
                >
                  Passa a {role === 'realizzazione' ? 'Sicurezza' : 'Realizzazione'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={styles.gradientBar} />
      <main className={styles.main}>
        {view === 'list' && <ListView />}
        {view === 'detail' && <DetailView />}
        {view === 'calendarioGlobale' && <CalendarioGlobaleView />}
        {view === 'riassegna' && <RiassegnaView />}
      </main>
      <Toast />
      <ErrorModal />
      <NotesModal />
    </div>
  );
}
