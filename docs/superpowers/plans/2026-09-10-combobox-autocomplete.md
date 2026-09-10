# Combobox Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every `<select>` and free-text search/filter `<input>` in the app with a single shared `Combobox` component that shows a dropdown of clickable, filtered results as the user types.

**Architecture:** One new component, `src/components/common/Combobox.tsx`, with two modes controlled by a `freeSolo` prop: "select" mode (commit-on-pick, replaces `<select>`) and "freeSolo" mode (fires `onChange` on every keystroke like today's search inputs, plus a clickable suggestions dropdown). No business logic changes anywhere — every call site keeps its existing `value`/`onChange` wiring; only the input markup changes.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest + Testing Library (`@testing-library/user-event` for interaction tests), CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-10-combobox-autocomplete-design.md`

## Global Constraints

- `Combobox`'s public interface (`ComboboxOption`, `ComboboxProps`) is exactly as defined in Task 1 — every later task imports it unchanged.
- Select-mode `onChange` fires only on option pick (click or Enter on the highlighted option), never on keystroke alone.
- FreeSolo-mode `onChange` fires on every keystroke (same behavior as the `<input>`s being replaced), and additionally supports clicking a suggestion to set the exact text.
- No business logic, dispatch shapes, or filter functions (`filterRows`, `filterByColumns`, the local `.filter()` calls) change in this plan — only the input widget each of them is bound to.
- Suggestion lists in freeSolo usages are capped at 8 entries.
- Every task that touches a file already using `<select>`/`<input>` must leave no stray unused `<select>`/plain search `<input>` behind for that specific field — grep for leftovers before committing.

---

### Task 1: `Combobox` component

**Files:**
- Create: `app/src/components/common/Combobox.tsx`
- Create: `app/src/components/common/Combobox.module.css`
- Test: `app/src/components/common/Combobox.test.tsx`

**Interfaces:**
- Produces:
  ```ts
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
  }

  export function Combobox(props: ComboboxProps): JSX.Element;
  ```
- Consumes: nothing (leaf UI component).

- [ ] **Step 1: Write the failing tests**

```tsx
// app/src/components/common/Combobox.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from './Combobox';

const OPTIONS: ComboboxOption[] = [
  { value: 'a', label: 'Alessia Costa' },
  { value: 'm', label: 'Matteo De Luca' },
  { value: 's', label: 'Simone Fontana' },
];

describe('Combobox — select mode', () => {
  it('shows the label of the current value, not the raw value', () => {
    render(<Combobox options={OPTIONS} value="m" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('Matteo De Luca');
  });

  it('does not call onChange while typing — only on pick', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    await user.type(screen.getByRole('combobox'), 'Ale');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters options by typed text and calls onChange on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    await user.type(screen.getByRole('combobox'), 'ale');
    const option = await screen.findByRole('option', { name: 'Alessia Costa' });
    expect(screen.queryByRole('option', { name: 'Matteo De Luca' })).not.toBeInTheDocument();
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('a');
    expect(screen.getByRole('combobox')).toHaveValue('Alessia Costa');
  });

  it('selects the highlighted option with ArrowDown + Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('m');
  });

  it('reverts the displayed text on Escape without committing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="m" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await user.clear(input);
    await user.type(input, 'zzz');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Matteo De Luca');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders group headers for grouped options', async () => {
    const grouped: ComboboxOption[] = [
      { value: 'a', label: 'Alessia Costa', group: 'Centro' },
      { value: 'b', label: 'Andrea Gallo', group: 'Nord Ovest' },
    ];
    const user = userEvent.setup();
    render(<Combobox options={grouped} value="" onChange={() => {}} />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Nord Ovest')).toBeInTheDocument();
  });
});

describe('Combobox — freeSolo mode', () => {
  it('calls onChange on every keystroke', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={[]} value="" onChange={onChange} freeSolo placeholder="Cerca" />);
    await user.type(screen.getByRole('combobox'), 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith('abc');
  });

  it('clicking a suggestion sets the exact text and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} freeSolo placeholder="Cerca" />);
    await user.type(screen.getByRole('combobox'), 'sim');
    const option = await screen.findByRole('option', { name: 'Simone Fontana' });
    await user.click(option);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('Simone Fontana'));
    expect(onChange).toHaveBeenLastCalledWith('s');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/components/common/Combobox.test.tsx`
Expected: FAIL — `Cannot find module './Combobox'`

- [ ] **Step 3: Implement `Combobox.tsx`**

```tsx
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
}: ComboboxProps) {
  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? '', [options, value]);
  const [query, setQuery] = useState(freeSolo ? value : selectedLabel);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
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
    setHighlighted(0);
  }, [filtered.length, open]);

  function commit(option: ComboboxOption) {
    setQuery(option.label);
    onChange(option.value);
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
    <div className={styles.wrap}>
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
```

- [ ] **Step 4: Implement `Combobox.module.css`**

```css
.wrap {
  position: relative;
}

.input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
  color: #1d2027;
  background: #fff;
}

.input:disabled {
  background: #f4f5f7;
  color: #9ca3af;
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 60;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(17, 20, 26, 0.12);
  max-height: 220px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 4px;
}

.groupHeader {
  font-size: 10.5px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  padding: 6px 8px 2px;
}

.option,
.optionActive {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 12.5px;
  color: #1d2027;
}

.optionActive {
  background: #EEF1FC;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx vitest run src/components/common/Combobox.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
cd app && git add src/components/common/Combobox.tsx src/components/common/Combobox.module.css src/components/common/Combobox.test.tsx
git commit -m "feat: add shared Combobox autocomplete component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `DetailView.tsx` — replace all 6 selects with Combobox

**Files:**
- Modify: `app/src/components/DetailView/DetailView.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `../common/Combobox` (Task 1).
- Produces: no change to any prop/dispatch signature — only markup.

- [ ] **Step 1: Import `Combobox`**

Add near the other common-component imports:
```ts
import { Combobox, type ComboboxOption } from '../common/Combobox';
```

- [ ] **Step 2: Add a small local helper for operator options**

Add near the top of the component body (after `task` is resolved), reused by every operator-picking select in this file:
```ts
  const operatorOptionsForTask: ComboboxOption[] = useMemo(
    () => operators.filter((o) => o.area === task?.areaFw).map((o) => ({ value: o.name, label: o.name })),
    [operators, task?.areaFw]
  );
  const slotOptions: ComboboxOption[] = useMemo(() => ALL_SLOTS.map((s) => ({ value: s, label: s })), []);
```
(Place this after the `if (!task) return ...` early-return guard is not possible since hooks must run unconditionally — instead compute `operatorOptionsForTask` using `task?.areaFw` with optional chaining as shown, since it's declared before the early return. Move the early return for `!task` to after these two `useMemo` calls if needed to keep hook order stable; verify no other hooks are declared after the existing early return before making this change.)

- [ ] **Step 3: Replace the "Nuovo appuntamento" slot `<select>`**

Replace:
```tsx
              <div className={styles.formField}>
                <span>Slot orario</span>
                <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                  {ALL_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
```
with:
```tsx
              <div className={styles.formField}>
                <span>Slot orario</span>
                <Combobox options={slotOptions} value={slot} onChange={(v) => setSlot(v)} placeholder="Seleziona slot" />
              </div>
```

- [ ] **Step 4: Replace the bulk "Assegna RDLC a selezionati..." `<select>`**

Replace:
```tsx
              <select
                value={bulkOperator}
                disabled={selectedApptIds.length === 0}
                onChange={(e) => {
                  const operatorName = e.target.value;
                  setBulkOperator('');
                  if (!operatorName) return;
                  for (const id of selectedApptIds) {
                    const appt = task.appointments.find((a) => a.id === id);
                    if (!appt) continue;
                    dispatch({
                      type: 'ASSIGN_RDLC',
                      protocollo: task.protocollo,
                      apptIds: [id],
                      operatorName,
                      day: appt.dataPianificazione,
                      slot: appt.slot,
                    });
                  }
                }}
              >
                <option value="">Assegna RDLC a selezionati...</option>
                {operators
                  .filter((o) => o.area === task.areaFw)
                  .map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
              </select>
```
with:
```tsx
              <Combobox
                options={operatorOptionsForTask}
                value={bulkOperator}
                placeholder="Assegna RDLC a selezionati..."
                disabled={selectedApptIds.length === 0}
                onChange={(operatorName) => {
                  setBulkOperator('');
                  if (!operatorName) return;
                  for (const id of selectedApptIds) {
                    const appt = task.appointments.find((a) => a.id === id);
                    if (!appt) continue;
                    dispatch({
                      type: 'ASSIGN_RDLC',
                      protocollo: task.protocollo,
                      apptIds: [id],
                      operatorName,
                      day: appt.dataPianificazione,
                      slot: appt.slot,
                    });
                  }
                }}
              />
```

- [ ] **Step 5: Replace the two "Operatore (per appuntamento da remoto)" selects (confirm-appt modal and rimodula modal)**

Both occurrences share the same options; add a constant once above the return statement:
```ts
  const modalOperatoreOptions: ComboboxOption[] = [{ value: '', label: 'Nessuno — in presenza' }, ...operatorOptionsForTask];
```

Replace (in the `confirm-appt` modal):
```tsx
              <select value={modalOperatore} onChange={(e) => setModalOperatore(e.target.value)}>
                <option value="">Nessuno — in presenza</option>
                {operators
                  .filter((o) => o.area === task.areaFw)
                  .map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
              </select>
```
with:
```tsx
              <Combobox options={modalOperatoreOptions} value={modalOperatore} onChange={setModalOperatore} placeholder="Nessuno — in presenza" />
```

Replace the identical block inside the `rimodula`-only branch of the rimodula/realizzazione-rimodula modal the same way.

- [ ] **Step 6: Replace the "Slot orario" select inside the rimodula/realizzazione-rimodula modal**

Replace:
```tsx
              <select value={modalSlot} onChange={(e) => setModalSlot(e.target.value)}>
                {ALL_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
```
with:
```tsx
              <Combobox options={slotOptions} value={modalSlot} onChange={(v) => setModalSlot(v)} placeholder="Seleziona slot" />
```

- [ ] **Step 7: Replace `ApptRow`'s inline "Seleziona op" select**

`ApptRow` receives `operators: { name: string; area: string }[]` already filtered by area at the call site — build its options inline (no new prop needed):
```tsx
      <td>
        {role === 'sicurezza' ? (
          <div className={styles.rdlcCell}>
            <Combobox
              options={[{ value: '', label: 'Seleziona op' }, ...operators.map((o) => ({ value: o.name, label: o.name }))]}
              value={appt.rdlc}
              disabled={!isOwner}
              onChange={(v) => v && onQuickAssignRdlc(v)}
              placeholder="Seleziona op"
            />
            <button className={styles.rdlcCalendarBtn} disabled={!isOwner} onClick={onOpenRdlc} aria-label="Disponibilità RDLC" type="button">
              <CalendarBlank size={14} />
            </button>
          </div>
        ) : (
          appt.rdlc || '—'
        )}
      </td>
```

- [ ] **Step 8: Verify no `<select>` remains for these fields**

Run: `cd app && grep -n "<select" src/components/DetailView/DetailView.tsx`
Expected: no output.

- [ ] **Step 9: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep DetailView`
Expected: no output.

- [ ] **Step 10: Run the existing DetailView roundtrip test**

Run: `cd app && npx vitest run src/components/DetailView/DetailView.roundtrip.test.tsx`
Expected: PASS (may need small updates if the test queries a `<select>` directly by role — if so, update its queries to `getByRole('combobox', { name: ... })` or by placeholder/label text; do not change the test's assertions about business behavior).

- [ ] **Step 11: Commit**

```bash
cd app && git add src/components/DetailView/DetailView.tsx src/components/DetailView/DetailView.roundtrip.test.tsx
git commit -m "feat: replace DetailView selects with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `RiassegnaView.tsx` — replace 3 selects with Combobox

**Files:**
- Modify: `app/src/components/RiassegnaView/RiassegnaView.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `../common/Combobox` (Task 1).

- [ ] **Step 1: Import `Combobox`**

```ts
import { Combobox, type ComboboxOption } from '../common/Combobox';
```

- [ ] **Step 2: Replace the search-form "Operatore" select (grouped by area)**

Add a memoized grouped-options builder:
```ts
  const operatorOptions: ComboboxOption[] = useMemo(
    () => AREAS.flatMap((area) => operatorsByArea[area].map((o) => ({ value: o.name, label: o.name, group: area }))),
    [operatorsByArea]
  );
```

Replace:
```tsx
          <select value={operatorName} onChange={(e) => setOperatorName(e.target.value)}>
            <option value="">Seleziona operatore</option>
            {AREAS.map((area) => (
              <optgroup key={area} label={area}>
                {operatorsByArea[area].map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
```
with:
```tsx
          <Combobox options={operatorOptions} value={operatorName} onChange={setOperatorName} placeholder="Seleziona operatore" />
```

- [ ] **Step 3: Replace the per-row "Nuovo RDLC" select**

Add near the other memoized option lists:
```ts
  const allOperatorOptions: ComboboxOption[] = useMemo(() => operators.map((o) => ({ value: o.name, label: o.name })), [operators]);
```

Replace:
```tsx
                      <select
                        value={rowOperator[row.apptId] ?? ''}
                        onChange={(e) => setRowOperator((r) => ({ ...r, [row.apptId]: e.target.value }))}
                      >
                        <option value="">Seleziona</option>
                        {operators.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
```
with:
```tsx
                      <Combobox
                        options={allOperatorOptions}
                        value={rowOperator[row.apptId] ?? ''}
                        onChange={(v) => setRowOperator((r) => ({ ...r, [row.apptId]: v }))}
                        placeholder="Seleziona"
                      />
```

- [ ] **Step 4: Replace the per-row "Operatore (remoto)" select**

```ts
  const allOperatorOptionsWithNone: ComboboxOption[] = useMemo(
    () => [{ value: '', label: 'Nessuno — in presenza' }, ...allOperatorOptions],
    [allOperatorOptions]
  );
```

Replace:
```tsx
                      <select
                        value={rowRemoteOperator[row.apptId] ?? ''}
                        onChange={(e) => setRowRemoteOperator((r) => ({ ...r, [row.apptId]: e.target.value }))}
                      >
                        <option value="">Nessuno — in presenza</option>
                        {operators.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
```
with:
```tsx
                      <Combobox
                        options={allOperatorOptionsWithNone}
                        value={rowRemoteOperator[row.apptId] ?? ''}
                        onChange={(v) => setRowRemoteOperator((r) => ({ ...r, [row.apptId]: v }))}
                        placeholder="Nessuno — in presenza"
                      />
```

- [ ] **Step 5: Verify no `<select>` remains**

Run: `cd app && grep -n "<select" src/components/RiassegnaView/RiassegnaView.tsx`
Expected: no output.

- [ ] **Step 6: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep RiassegnaView`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd app && git add src/components/RiassegnaView/RiassegnaView.tsx
git commit -m "feat: replace RiassegnaView selects with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `RdlcDrawer.tsx` — area select + operator search → Combobox

**Files:**
- Modify: `app/src/components/common/RdlcDrawer.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `./Combobox` (Task 1, same directory).

- [ ] **Step 1: Import `Combobox`**

```ts
import { Combobox, type ComboboxOption } from './Combobox';
```

- [ ] **Step 2: Replace the area filter `<select>` (select mode)**

Add above the return statement:
```ts
  const areaOptions: ComboboxOption[] = [{ value: 'Tutte', label: 'Tutte le aree' }, ...AREAS.map((a) => ({ value: a, label: a }))];
```

Replace:
```tsx
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as AreaFw | 'Tutte')}>
            <option value="Tutte">Tutte le aree</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
```
with:
```tsx
          <Combobox
            options={areaOptions}
            value={areaFilter}
            onChange={(v) => setAreaFilter(v as AreaFw | 'Tutte')}
            placeholder="Tutte le aree"
          />
```

- [ ] **Step 3: Replace the "Cerca operatore" search input (freeSolo mode)**

Add a memoized suggestion list, capped at 8, built from the area-filtered operator pool (before the name-substring filter is applied, so suggestions reflect the area filter but not yet the search text itself):
```ts
  const areaScopedOperators = operators.filter((o) => areaFilter === 'Tutte' || o.area === areaFilter);
  const searchSuggestions: ComboboxOption[] = areaScopedOperators
    .filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)
    .map((o) => ({ value: o.name, label: o.name }));
```

Replace:
```tsx
          <input placeholder="Cerca operatore" value={search} onChange={(e) => setSearch(e.target.value)} />
```
with:
```tsx
          <Combobox
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca operatore"
            aria-label="Cerca operatore"
          />
```

Note: `filtered` (the grid's row list) still applies `areaFilter` AND `search` exactly as before — this step only changes the search box's own widget, not the filtering logic below it.

- [ ] **Step 4: Verify no `<select>`/plain search `<input>` remains for these two fields**

Run: `cd app && grep -n "<select\|Cerca operatore" src/components/common/RdlcDrawer.tsx`
Expected: only the new `Combobox`/`aria-label`/`placeholder` lines, no `<select` or bare `<input placeholder="Cerca operatore"`.

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep RdlcDrawer`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/components/common/RdlcDrawer.tsx
git commit -m "feat: replace RdlcDrawer area select and operator search with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `CalendarioGlobaleView.tsx` — area select + operator search → Combobox

**Files:**
- Modify: `app/src/components/CalendarioGlobaleView/CalendarioGlobaleView.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `../common/Combobox` (Task 1).

- [ ] **Step 1: Import `Combobox`**

```ts
import { Combobox, type ComboboxOption } from '../common/Combobox';
```

- [ ] **Step 2: Replace the area filter `<select>`**

```ts
  const areaOptions: ComboboxOption[] = [{ value: 'Tutte', label: 'Tutte le aree' }, ...AREAS.map((a) => ({ value: a, label: a }))];
```

Replace:
```tsx
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as AreaFw | 'Tutte')}>
          <option value="Tutte">Tutte le aree</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
```
with:
```tsx
        <Combobox
          options={areaOptions}
          value={areaFilter}
          onChange={(v) => setAreaFilter(v as AreaFw | 'Tutte')}
          placeholder="Tutte le aree"
        />
```

- [ ] **Step 3: Replace the "Cerca operatore" input**

```ts
  const areaScopedOperators = operators.filter((o) => areaFilter === 'Tutte' || o.area === areaFilter);
  const searchSuggestions: ComboboxOption[] = areaScopedOperators
    .filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)
    .map((o) => ({ value: o.name, label: o.name }));
```

Replace:
```tsx
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <input placeholder="Cerca operatore" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
```
with:
```tsx
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <Combobox
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca operatore"
            aria-label="Cerca operatore"
          />
        </div>
```

- [ ] **Step 4: Verify no `<select>` remains**

Run: `cd app && grep -n "<select" src/components/CalendarioGlobaleView/CalendarioGlobaleView.tsx`
Expected: no output.

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep CalendarioGlobaleView`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/components/CalendarioGlobaleView/CalendarioGlobaleView.tsx
git commit -m "feat: replace CalendarioGlobaleView area select and operator search with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `ListView.tsx` — search input → Combobox (freeSolo)

**Files:**
- Modify: `app/src/components/ListView/ListView.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `../common/Combobox` (Task 1).

- [ ] **Step 1: Import `Combobox`**

```ts
import { Combobox, type ComboboxOption } from '../common/Combobox';
```

- [ ] **Step 2: Build a capped, deduplicated suggestion list from protocollo/cliente/citta**

Add near `searched`:
```ts
  const searchSuggestions: ComboboxOption[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: ComboboxOption[] = [];
    for (const t of statusFiltered) {
      for (const field of [t.protocollo, t.cliente, t.citta]) {
        if (out.length >= 8) break;
        if (!field.toLowerCase().includes(q) || seen.has(field)) continue;
        seen.add(field);
        out.push({ value: field, label: field });
      }
    }
    return out;
  }, [statusFiltered, search]);
```

- [ ] **Step 3: Replace the search `<input>`**

Replace:
```tsx
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <input
            placeholder="Cerca RC, cliente, città..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Cerca"
          />
        </div>
```
with:
```tsx
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <Combobox
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca RC, cliente, città..."
            aria-label="Cerca"
          />
        </div>
```

- [ ] **Step 4: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep ListView`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/components/ListView/ListView.tsx
git commit -m "feat: replace ListView search input with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `DataTable.tsx` — per-column filter input → Combobox (freeSolo)

**Files:**
- Modify: `app/src/components/common/DataTable.tsx`

**Interfaces:**
- Consumes: `Combobox`, `ComboboxOption` from `./Combobox` (Task 1, same directory).
- Produces: no change to `ColumnDef<T>` or `DataTable`'s outer props — purely internal.

- [ ] **Step 1: Import `Combobox`**

```ts
import { Combobox, type ComboboxOption } from './Combobox';
```

- [ ] **Step 2: Build per-column suggestion options**

Add a helper inside the component, above the `return`:
```ts
  function columnSuggestions(col: ColumnDef<T>): ComboboxOption[] {
    const q = (columnFilters[col.key] ?? '').trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: ComboboxOption[] = [];
    for (const row of rows) {
      const raw = String((row as Record<string, unknown>)[col.key] ?? '');
      if (!raw || seen.has(raw) || !raw.toLowerCase().includes(q)) continue;
      seen.add(raw);
      out.push({ value: raw, label: raw });
      if (out.length >= 8) break;
    }
    return out;
  }
```
(Uses `rows`, the pre-filter set, per the spec's "before applying the filter of that same column" rule — every other active column filter is intentionally NOT excluded here either, keeping this simple: suggestions are drawn from the full unfiltered row set for that column, which is a reasonable reading of "valori distinti di quella colonna tra le righe correnti" and avoids a chicken-and-egg dependency on `filtered`.)

- [ ] **Step 3: Replace the per-column filter `<input>`**

Replace:
```tsx
                <th key={col.key} className={styles.filterTh}>
                  <span className={styles.filterInput}>
                    <MagnifyingGlass size={12} />
                    <input
                      value={columnFilters[col.key] ?? ''}
                      onChange={(e) => setColumnFilter(col.key, e.target.value)}
                      aria-label={`Filtra ${col.header}`}
                    />
                  </span>
                </th>
```
with:
```tsx
                <th key={col.key} className={styles.filterTh}>
                  <span className={styles.filterInput}>
                    <MagnifyingGlass size={12} />
                    <Combobox
                      options={columnSuggestions(col)}
                      value={columnFilters[col.key] ?? ''}
                      onChange={(v) => setColumnFilter(col.key, v)}
                      freeSolo
                      aria-label={`Filtra ${col.header}`}
                    />
                  </span>
                </th>
```

- [ ] **Step 4: Verify no plain filter `<input>` remains**

Run: `cd app && grep -n "aria-label={\`Filtra" src/components/common/DataTable.tsx`
Expected: one match, on the new `Combobox` line (not a bare `<input`).

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep DataTable`
Expected: no output.

- [ ] **Step 6: Run any existing table logic tests**

Run: `cd app && npx vitest run src/logic/table.test.ts`
Expected: PASS (unaffected — `DataTable`'s filtering logic itself is unchanged, only its input widget).

- [ ] **Step 7: Commit**

```bash
cd app && git add src/components/common/DataTable.tsx
git commit -m "feat: replace DataTable per-column filter inputs with Combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd app && npx tsc -b --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 2: Full test suite**

Run: `cd app && npx vitest run`
Expected: all test files pass, including the new `Combobox.test.tsx`.

- [ ] **Step 3: Grep for any remaining bare `<select>` or the specific replaced search inputs**

Run: `cd app && grep -rn "<select" src`
Expected: no output (every `<select>` inventoried in the spec has been replaced).

- [ ] **Step 4: Lint**

Run: `cd app && npm run lint`
Expected: no new errors (pre-existing `only-export-components` warnings unrelated to this plan are fine).

- [ ] **Step 5: Manual smoke test in the running dev server**

Start (or reuse) the dev server (`npm run dev`) and check:
- DetailView (Sicurezza role): the per-row "Seleziona op" combobox filters as you type and picks an operator on click; the bulk toolbar's "Assegna RDLC a selezionati..." combobox behaves the same; the confirm/rimodula modals' Operatore and Slot comboboxes filter and commit correctly; typing then clicking away without picking reverts to the previous value.
- RiassegnaView: the search-form Operatore combobox shows area group headers and filters across all areas; per-row Nuovo RDLC / Operatore (remoto) comboboxes work independently.
- RdlcDrawer and CalendarioGlobaleView: area combobox filters correctly; "Cerca operatore" combobox filters the grid live per keystroke AND shows a clickable suggestion list.
- ListView: the main search combobox filters the table live and shows clickable protocollo/cliente/città suggestions.
- DataTable: at least one column's filter combobox shows suggestions drawn from that column's values and filters the table on typing.

- [ ] **Step 6: If everything passes, this plan is complete — no further commit needed (verification only).**
