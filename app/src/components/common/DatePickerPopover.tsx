import { useRef } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { formatDate } from '../../logic/dates';
import styles from './DatePickerPopover.module.css';

function toInputValue(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  if (!dd || !mm || !yyyy) return '';
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputValue(value: string): string {
  if (!value) return '';
  const [yyyy, mm, dd] = value.split('-');
  return formatDate(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
}

/**
 * Reusable date picker: a labeled trigger showing the current value with a calendar icon,
 * backed by a native date input. Used across the new-appointment form, RDLC drawer jump,
 * Calendario jump, and Riassegna from/to fields.
 */
export function DatePickerPopover({
  label,
  value,
  onChange,
  id,
}: {
  label?: string;
  value: string; // DD/MM/YYYY or ''
  onChange: (ddmmyyyy: string) => void;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    } else {
      el.focus();
    }
  }

  return (
    <label className={styles.wrap} htmlFor={id}>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.field} onClick={openPicker}>
        <CalendarBlank size={16} />
        <span className={styles.value}>{value || 'Seleziona data'}</span>
        <input
          ref={inputRef}
          id={id}
          type="date"
          className={styles.hiddenInput}
          value={toInputValue(value)}
          onChange={(e) => onChange(fromInputValue(e.target.value))}
          aria-label={label || 'Data'}
        />
      </span>
    </label>
  );
}
