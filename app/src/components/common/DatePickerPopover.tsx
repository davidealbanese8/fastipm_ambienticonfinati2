import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { formatDate } from '../../logic/dates';
import styles from './DatePickerPopover.module.css';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MONTH_LABELS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

function parseValue(ddmmyyyy: string): Date | null {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  if (!dd || !mm || !yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Mon=0..Sun=6 weekday index for the first day of the grid. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

/**
 * Reusable date picker: a labeled trigger showing the current value with a calendar icon,
 * opening a custom in-app calendar panel styled to match the rest of the UI (rather than
 * the browser's native date picker). Used across the new-appointment form, RDLC drawer jump,
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
  const selected = value ? parseValue(value) : null;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    setViewDate(selected ?? new Date());
    function updateRect() {
      const el = fieldRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left });
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!fieldRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  function pick(d: Date) {
    onChange(formatDate(d));
    setOpen(false);
  }

  const days = monthGrid(viewDate.getFullYear(), viewDate.getMonth());
  const today = new Date();

  return (
    <label className={styles.wrap} htmlFor={id}>
      {label && <span className={styles.label}>{label}</span>}
      <button ref={fieldRef} type="button" id={id} className={styles.field} onClick={() => setOpen((v) => !v)}>
        <CalendarBlank size={16} />
        <span className={styles.value}>{value || 'Seleziona data'}</span>
      </button>
      {open &&
        rect &&
        createPortal(
          <div ref={panelRef} className={styles.panel} style={{ position: 'fixed', top: rect.top, left: rect.left }}>
            <div className={styles.panelHeader}>
              <button
                type="button"
                className={styles.navBtn}
                aria-label="Mese precedente"
                onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              >
                <CaretLeft size={14} />
              </button>
              <span className={styles.monthLabel}>
                {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <button
                type="button"
                className={styles.navBtn}
                aria-label="Mese successivo"
                onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              >
                <CaretRight size={14} />
              </button>
            </div>
            <div className={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((w, i) => (
                <span key={i} className={styles.weekdayCell}>
                  {w}
                </span>
              ))}
            </div>
            <div className={styles.dayGrid}>
              {days.map((d) => {
                const outOfMonth = d.getMonth() !== viewDate.getMonth();
                const isSelected = selected && sameDay(d, selected);
                const isToday = sameDay(d, today);
                const cls = isSelected
                  ? styles.dayActive
                  : outOfMonth
                    ? styles.dayMuted
                    : isToday
                      ? styles.dayToday
                      : styles.day;
                return (
                  <button key={d.toISOString()} type="button" className={cls} onClick={() => pick(d)}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </label>
  );
}
