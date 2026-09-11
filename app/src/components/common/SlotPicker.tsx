import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WORK_HOURS, hourOf, slotsInHour, type TimeSlot } from '../../logic/timeSlots';
import styles from './SlotPicker.module.css';

/**
 * Slot orario picker: shows all 15-minute slots at once, split into two columns —
 * hours on the left, that hour's quarter-hours on the right — instead of a flat
 * 32-item dropdown list.
 */
export function SlotPicker({
  value,
  onChange,
  placeholder = 'Seleziona slot',
  disabled,
  id,
  'aria-label': ariaLabel,
}: {
  value: TimeSlot | '';
  onChange: (slot: TimeSlot) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeHour, setActiveHour] = useState<number>(value ? hourOf(value) : WORK_HOURS[0]);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    if (value) setActiveHour(hourOf(value));
    function updateRect() {
      const el = fieldRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
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
      const insideField = fieldRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideField && !insidePanel) setOpen(false);
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  function pick(slot: TimeSlot) {
    onChange(slot);
    setOpen(false);
  }

  return (
    <div className={styles.wrap} ref={fieldRef}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={styles.field}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? styles.value : styles.placeholder}>{value || placeholder}</span>
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{ position: 'fixed', top: rect.top, left: rect.left, minWidth: rect.width }}
          >
            <div className={styles.hourCol} role="listbox" aria-label="Ora">
              {WORK_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={h === activeHour ? styles.hourBtnActive : styles.hourBtn}
                  onMouseEnter={() => setActiveHour(h)}
                  onClick={() => setActiveHour(h)}
                >
                  {String(h).padStart(2, '0')}
                </button>
              ))}
            </div>
            <div className={styles.quarterCol} role="listbox" aria-label="Quarto d'ora">
              {slotsInHour(activeHour).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={s === value}
                  className={s === value ? styles.quarterBtnActive : styles.quarterBtn}
                  onClick={() => pick(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
