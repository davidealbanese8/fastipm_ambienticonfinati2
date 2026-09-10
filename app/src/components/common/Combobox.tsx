// app/src/components/common/Combobox.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  freeSolo?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  freeSolo = false,
  className,
}: ComboboxProps) {
  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? '', [options, value]);
  const [query, setQuery] = useState(freeSolo ? value : selectedLabel);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!freeSolo) setQuery(selectedLabel);
  }, [freeSolo, selectedLabel]);

  useEffect(() => () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setHighlighted(-1);
  }, [filtered.length, open]);

  function commit(option: ComboboxOption) {
    setQuery(option.label);
    onChange(freeSolo ? option.label : option.value);
    setOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setQuery(text);
    setOpen(true);
    if (freeSolo) onChange(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[highlighted]) {
        e.preventDefault();
        commit(filtered[highlighted]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      if (!freeSolo) setQuery(selectedLabel);
    }
  }

  function handleBlur() {
    blurTimeout.current = setTimeout(() => {
      setOpen(false);
      if (!freeSolo) setQuery(selectedLabel);
    }, 150);
  }

  function handleOptionMouseDown(e: React.MouseEvent, option: ComboboxOption) {
    e.preventDefault();
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    commit(option);
  }

  let lastGroup: string | undefined;

  return (
    <div className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className={styles.input}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className={styles.menu} role="listbox">
          {filtered.map((option, i) => {
            const showGroupHeader = !!option.group && option.group !== lastGroup;
            lastGroup = option.group;
            return (
              <li key={option.value + '|' + option.label}>
                {showGroupHeader && <div className={styles.groupHeader}>{option.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlighted}
                  className={i === highlighted ? styles.optionActive : styles.option}
                  onMouseDown={(e) => handleOptionMouseDown(e, option)}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
