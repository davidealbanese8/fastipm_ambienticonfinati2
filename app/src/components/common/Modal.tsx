import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import styles from './Modal.module.css';

export function Modal({
  title,
  children,
  onClose,
  footer,
  scrimVariant = 'modal',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  scrimVariant?: 'modal' | 'drawer';
}) {
  return (
    <div
      className={styles.scrim}
      style={{ background: scrimVariant === 'modal' ? 'rgba(17,20,26,0.45)' : 'rgba(17,20,26,0.35)' }}
      onClick={onClose}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
