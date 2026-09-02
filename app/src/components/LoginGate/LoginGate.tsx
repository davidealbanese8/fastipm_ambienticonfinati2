import { useState, type FormEvent, type ReactNode } from 'react';
import styles from './LoginGate.module.css';

const SESSION_KEY = 'fastipm-authed';
const PASSWORD = 'Settembre';

export function isAuthed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(isAuthed());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password === PASSWORD) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // ignore storage errors
      }
      setAuthed(true);
      setError(null);
    } else {
      setError('Password non corretta.');
    }
  }

  if (authed) return <>{children}</>;

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.logo}>
          <span className={styles.logoBadge}>🦋</span>
          <span className={styles.wordmark}>
            FAST<span className={styles.wordmarkAccent}>ipm</span>
          </span>
        </div>
        <h1 className={styles.title}>Accesso riservato</h1>
        <p className={styles.subtitle}>Inserisci la password per accedere alla dashboard.</p>
        <input
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoFocus
        />
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        <button type="submit" className={styles.submit}>
          Entra
        </button>
      </form>
    </div>
  );
}
