import { useEffect } from 'react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import styles from './Toast.module.css';

export function Toast() {
  const { toast } = useAppState();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dispatch({ type: 'DISMISS_TOAST' }), 2200);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  if (!toast) return null;

  return (
    <div className={styles.toast} role="status">
      {toast.message}
    </div>
  );
}
