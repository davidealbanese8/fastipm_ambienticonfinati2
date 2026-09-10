# Slot 15min + Colonna Operatore + Appuntamento da remoto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two fixed fasce orarie with 15-minute time slots, add a new "Operatore" field selectable alongside RDLC when an appointment is confirmed/rimodulato, derive presenza/remoto from its presence, and update every view (DetailView, RiassegnaView, CalendarioGlobaleView, RdlcDrawer, ListView) accordingly.

**Architecture:** All slot generation/formatting logic is centralized in one new module (`src/logic/timeSlots.ts`), replacing three duplicated `FASCE` constants. `Appointment.fasciaOraria`/`fasciaOrariaRdlc` are renamed and retyped to `slot`/`slotRdlc: TimeSlot`. A new `operatore: string` field is added (`''` = presenza). No new stored "modalità" field — it's derived everywhere via a single `isRemoto(appt)` helper. Business rules in `logic/rules.ts` gain an optional `operatore` parameter on confirm/rimodula and a new `reassignRemoteOperator`; the existing `reassignOperator` (RDLC reassignment) is renamed to `reassignRdlc` for clarity now that "operatore" means something else. UI changes are additive (new column, new optional select) rather than restructuring existing components.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest + Testing Library, CSS Modules, no external calendar/date library.

**Spec:** `docs/superpowers/specs/2026-09-10-operatore-slot15min-design.md`

## Global Constraints

- Working hours stay `09:00–13:00` and `14:00–18:00`, now split into 15-minute slots (32 slots/day: 16 + 16).
- Calendar columns group by hour (`09,10,11,12,14,15,16,17` — `WORK_HOURS`), not by individual 15-min slot; each appointment shows its exact slot inside its hour cell.
- `operatore` is never validated against the operators pool at the rules layer — consistent with how `rdlc`/`assignRdlc` already work today (plain string, constrained only by the UI select's options). Do not add new validation infra.
- Modalità (presenza/remoto) is never stored; always derive via `isRemoto(appt) = !!appt.operatore`.
- `operatore` resets to `''` whenever RDLC is reassigned, or whenever Realizzazione counter-proposes a new date/slot (`realizzazioneRimodulaAppt`) — a new confirmation cycle must re-decide the modality.
- Every renamed/retyped field or function must be updated at every call site in the same task that renames it — no stale references left for a later task to discover via type errors alone; grep for the old name before moving on.

---

### Task 1: `timeSlots.ts` — shared slot generation module

**Files:**
- Create: `app/src/logic/timeSlots.ts`
- Test: `app/src/logic/timeSlots.test.ts`

**Interfaces:**
- Produces: `ALL_SLOTS: string[]` (32 values, `"09:00"`…`"12:45"`, `"14:00"`…`"17:45"`), `WORK_HOURS: number[]` (`[9,10,11,12,14,15,16,17]`), `hourOf(slot: string): number`, `slotsInHour(hour: number): string[]`, `formatSlotRange(slot: string): string` (e.g. `"09:15–09:30"`).
- Consumes: nothing (leaf module).

- [ ] **Step 1: Write the failing test**

```ts
// app/src/logic/timeSlots.test.ts
import { describe, expect, it } from 'vitest';
import { ALL_SLOTS, WORK_HOURS, hourOf, slotsInHour, formatSlotRange } from './timeSlots';

describe('timeSlots', () => {
  it('generates 32 slots across the two work ranges', () => {
    expect(ALL_SLOTS).toHaveLength(32);
    expect(ALL_SLOTS[0]).toBe('09:00');
    expect(ALL_SLOTS[15]).toBe('12:45');
    expect(ALL_SLOTS[16]).toBe('14:00');
    expect(ALL_SLOTS[31]).toBe('17:45');
    expect(ALL_SLOTS).not.toContain('13:00');
    expect(ALL_SLOTS).not.toContain('18:00');
  });

  it('exposes the 8 work hours used as calendar columns', () => {
    expect(WORK_HOURS).toEqual([9, 10, 11, 12, 14, 15, 16, 17]);
  });

  it('hourOf extracts the hour from a slot', () => {
    expect(hourOf('09:15')).toBe(9);
    expect(hourOf('17:45')).toBe(17);
  });

  it('slotsInHour returns the 4 quarter-hour slots for that hour', () => {
    expect(slotsInHour(9)).toEqual(['09:00', '09:15', '09:30', '09:45']);
    expect(slotsInHour(13)).toEqual([]); // lunch break, not a work hour
  });

  it('formatSlotRange shows start–end of the 15-minute block', () => {
    expect(formatSlotRange('09:15')).toBe('09:15–09:30');
    expect(formatSlotRange('12:45')).toBe('12:45–13:00');
    expect(formatSlotRange('17:45')).toBe('17:45–18:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/logic/timeSlots.test.ts`
Expected: FAIL — `Cannot find module './timeSlots'`

- [ ] **Step 3: Write minimal implementation**

```ts
// app/src/logic/timeSlots.ts
export type TimeSlot = string; // "HH:MM", inizio di un blocco da 15 minuti

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildRange(startHour: number, endHour: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 15, 30, 45]) slots.push(`${pad2(h)}:${pad2(m)}`);
  }
  return slots;
}

export const ALL_SLOTS: TimeSlot[] = [...buildRange(9, 13), ...buildRange(14, 18)];

export const WORK_HOURS: number[] = [9, 10, 11, 12, 14, 15, 16, 17];

export function hourOf(slot: TimeSlot): number {
  return Number(slot.slice(0, 2));
}

export function slotsInHour(hour: number): TimeSlot[] {
  return ALL_SLOTS.filter((s) => hourOf(s) === hour);
}

export function formatSlotRange(slot: TimeSlot): string {
  const [h, m] = slot.split(':').map(Number);
  let endH = h;
  let endM = m + 15;
  if (endM === 60) {
    endM = 0;
    endH += 1;
  }
  return `${slot}–${pad2(endH)}:${pad2(endM)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/logic/timeSlots.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd app && git add src/logic/timeSlots.ts src/logic/timeSlots.test.ts
git commit -m "feat: add shared 15-minute time slot module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `types.ts` — rename fields, add `operatore`, remove `FasciaOraria`

**Files:**
- Modify: `app/src/types.ts`

**Interfaces:**
- Consumes: `TimeSlot` is defined locally in this file (not imported from `logic/timeSlots.ts`, to avoid a `types → logic` dependency; `logic/timeSlots.ts` re-exports the same shape as `string` so both are structurally identical).
- Produces: `Appointment.slot: TimeSlot` (was `fasciaOraria: FasciaOraria`), `Appointment.slotRdlc: TimeSlot | ''` (was `fasciaOrariaRdlc: FasciaOraria | ''`), `Appointment.operatore: string` (new).

- [ ] **Step 1: Edit `types.ts`**

Replace:
```ts
export type FasciaOraria = '09:00 - 13:00' | '14:00 - 18:00';
```
with:
```ts
export type TimeSlot = string; // "HH:MM", inizio di un blocco da 15 minuti — vedi logic/timeSlots.ts
```

Replace the `Appointment` interface:
```ts
export interface Appointment {
  id: number;
  cameretta: string;
  dataPianificazione: string; // DD/MM/YYYY
  slot: TimeSlot;
  stato: AppointmentStatus;
  rdlc: string;
  dataRdlc: string; // '' or DD/MM/YYYY
  slotRdlc: TimeSlot | '';
  operatore: string; // '' = in presenza; valorizzato = da remoto
}
```

- [ ] **Step 2: Confirm the project no longer type-checks other files (expected — later tasks fix these)**

Run: `cd app && npx tsc -b --noEmit 2>&1 | head -40`
Expected: a list of errors in `logic/mockData.ts`, `logic/rules.ts`, `state/AppContext.tsx`, `components/DetailView/DetailView.tsx`, `components/CalendarioGlobaleView/CalendarioGlobaleView.tsx`, `components/common/RdlcDrawer.tsx`, `components/RiassegnaView/RiassegnaView.tsx`, `components/ListView/ListView.tsx`, and the two test files referencing `fasciaOraria` — this is the expected fallout, resolved task-by-task below. Do not fix them here.

- [ ] **Step 3: Commit**

```bash
cd app && git add src/types.ts
git commit -m "refactor: replace FasciaOraria with TimeSlot, add operatore field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `logic/rules.ts` — operatore param, derived modality, renamed reassignment

**Files:**
- Modify: `app/src/logic/rules.ts`
- Modify: `app/src/logic/rules.test.ts`

**Interfaces:**
- Consumes: `Appointment`, `Task`, `Note` from `../types` (`slot`, `slotRdlc`, `operatore` fields from Task 2).
- Produces: `isRemoto(appt: Appointment): boolean`; `confirmAppt(task, apptId, operatore？= '')`; `rimodulaAppt(task, apptId, newData, newSlot, operatore？= '')`; `addAppointment(task, cameretta, data, slot)`; `assignRdlc(task, apptIds, operatorName, day, slot)`; `reassignRdlc(task, apptId, newRdlcName)` (renamed from `reassignOperator`); `reassignRemoteOperator(task, apptId, operatore: string)`.

- [ ] **Step 1: Update `rules.test.ts` for the renamed fields first (still red)**

Update `makeAppt` and the two tests that reference the old field names:

```ts
function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    cameretta: 'Cameretta A1',
    dataPianificazione: '10/09/2026',
    slot: '09:00',
    stato: 'Nuovo',
    rdlc: '',
    dataRdlc: '',
    slotRdlc: '',
    operatore: '',
    ...overrides,
  };
}
```

In `describe('confirmAppt ...')`, replace the second test:
```ts
  it('locks dataRdlc/slotRdlc to planned values on confirm, and defaults to presenza', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi', dataPianificazione: '12/09/2026', slot: '14:15' })],
    });
    const next = confirmAppt(task, 1);
    expect(next.appointments[0].stato).toBe('Confermato');
    expect(next.appointments[0].dataRdlc).toBe('12/09/2026');
    expect(next.appointments[0].slotRdlc).toBe('14:15');
    expect(next.appointments[0].operatore).toBe('');
  });

  it('confirming with an operatore marks the appointment as remoto', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi' })],
    });
    const next = confirmAppt(task, 1, 'Elena Rossi');
    expect(next.appointments[0].operatore).toBe('Elena Rossi');
    expect(isRemoto(next.appointments[0])).toBe(true);
  });
```

In `describe('addAppointment')`, replace `'09:00 - 13:00'` literals with `'09:00'`.

Add import of `isRemoto` alongside the existing named imports at the top of the file.

Add a new describe block at the end:
```ts
describe('isRemoto', () => {
  it('is false when operatore is empty, true when set', () => {
    expect(isRemoto(makeAppt({ operatore: '' }))).toBe(false);
    expect(isRemoto(makeAppt({ operatore: 'Elena Rossi' }))).toBe(true);
  });
});

describe('reassignRdlc / reassignRemoteOperator', () => {
  it('reassignRdlc changes rdlc and resets operatore', () => {
    const task = makeTask({ appointments: [makeAppt({ rdlc: 'Mario Rossi', operatore: 'Elena Rossi' })] });
    const next = reassignRdlc(task, 1, 'Giulia Marino');
    expect(next.appointments[0].rdlc).toBe('Giulia Marino');
    expect(next.appointments[0].operatore).toBe('');
    expect(next.notes).toHaveLength(1);
  });

  it('reassignRemoteOperator sets or clears operatore without touching rdlc', () => {
    const task = makeTask({ appointments: [makeAppt({ rdlc: 'Mario Rossi', operatore: '' })] });
    const withRemote = reassignRemoteOperator(task, 1, 'Elena Rossi');
    expect(withRemote.appointments[0].operatore).toBe('Elena Rossi');
    expect(withRemote.appointments[0].rdlc).toBe('Mario Rossi');

    const backToPresenza = reassignRemoteOperator(withRemote, 1, '');
    expect(backToPresenza.appointments[0].operatore).toBe('');
  });
});

describe('realizzazioneRimodulaAppt resets operatore', () => {
  it('clears operatore on counter-proposal, forcing a fresh modality decision', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [makeAppt({ rdlc: 'Mario Rossi', operatore: 'Elena Rossi', stato: 'Da Rimodulare' })],
    });
    const next = realizzazioneRimodulaAppt(task, 1, '15/09/2026', '10:00');
    expect(next.appointments[0].operatore).toBe('');
    expect(next.appointments[0].stato).toBe('Da Confermare');
  });
});
```

Update the top import list to include `isRemoto`, `reassignRdlc`, `reassignRemoteOperator`, `realizzazioneRimodulaAppt`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/logic/rules.test.ts`
Expected: FAIL — `isRemoto`/`reassignRdlc`/`reassignRemoteOperator` not exported, `slot`/`operatore` type errors.

- [ ] **Step 3: Implement in `rules.ts`**

Add near the top, after the existing ownership helpers:
```ts
export function isRemoto(appt: Appointment): boolean {
  return !!appt.operatore;
}
```

Replace `confirmAppt`:
```ts
export function confirmAppt(task: Task, apptId: number, operatore: string = ''): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const appt = task.appointments.find((a) => a.id === apptId);
  if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Confermato',
    dataRdlc: a.dataPianificazione,
    slotRdlc: a.slot,
    operatore,
  }));
  return stampUpdate(next);
}
```

Replace `rimodulaAppt`:
```ts
export function rimodulaAppt(task: Task, apptId: number, newData: string, newSlot: Appointment['slot'], operatore: string = ''): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const appt = task.appointments.find((a) => a.id === apptId);
  if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Da Rimodulare',
    dataRdlc: newData,
    slotRdlc: newSlot,
    operatore,
  }));
  return stampUpdate(next);
}
```

In `confermaProposta`, rename fields (no behavior change — operatore is left untouched, it was already decided by Sicurezza):
```ts
export function confermaProposta(task: Task, apptId: number): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Confermato',
    dataPianificazione: a.dataRdlc || a.dataPianificazione,
    slot: a.slotRdlc || a.slot,
  }));
  return stampUpdate(next);
}
```

Replace `realizzazioneRimodulaAppt` (resets `operatore`):
```ts
export function realizzazioneRimodulaAppt(
  task: Task,
  apptId: number,
  newData: string,
  newSlot: Appointment['slot']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Da Confermare',
    dataPianificazione: newData,
    slot: newSlot,
    operatore: '',
  }));
  return stampUpdate(next);
}
```

Replace `addAppointment` field names:
```ts
export function addAppointment(
  task: Task,
  cameretta: string,
  data: string,
  slot: Appointment['slot']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (!cameretta || !data || !slot) throw new RuleError('Compila tutti i campi obbligatori.');
  const nextId = task.appointments.length ? Math.max(...task.appointments.map((a) => a.id)) + 1 : 1;
  const appt: Appointment = {
    id: nextId,
    cameretta,
    dataPianificazione: data,
    slot,
    stato: 'Nuovo',
    rdlc: '',
    dataRdlc: '',
    slotRdlc: '',
    operatore: '',
  };
  return stampUpdate({ ...task, appointments: [...task.appointments, appt] });
}
```

Replace `assignRdlc` field names (bulk RDLC assignment does not touch `operatore`):
```ts
export function assignRdlc(
  task: Task,
  apptIds: number[],
  operatorName: string,
  day: string,
  slot: Appointment['slot']
): Task {
  let next: Task = {
    ...task,
    appointments: task.appointments.map((a) => {
      if (!apptIds.includes(a.id)) return a;
      const matchesPlanned = a.dataPianificazione === day;
      return {
        ...a,
        rdlc: operatorName,
        dataRdlc: day,
        slotRdlc: slot,
        stato: matchesPlanned ? 'Confermato' : 'Da Rimodulare',
      };
    }),
  };
  next = addNote(next, 'System Sicurezza', `RDLC ${operatorName} assegnato per il ${day} (${slot}).`);
  return stampUpdate(next);
}
```

Replace `reassignOperator` with `reassignRdlc` (resets `operatore`) and add `reassignRemoteOperator`:
```ts
/** Riassegnazione: change the rdlc field on the target appointment, resetting operatore (a new RDLC re-decides modality). */
export function reassignRdlc(task: Task, apptId: number, newRdlcName: string): Task {
  let next = updateAppt(task, apptId, (a) => ({ ...a, rdlc: newRdlcName, operatore: '' }));
  next = addNote(next, 'System Sicurezza', `RDLC riassegnato a ${newRdlcName}.`);
  return stampUpdate(next);
}

/** Riassegnazione: set or clear (empty string) the Operatore, without touching rdlc. */
export function reassignRemoteOperator(task: Task, apptId: number, operatore: string): Task {
  let next = updateAppt(task, apptId, (a) => ({ ...a, operatore }));
  next = addNote(
    next,
    'System Sicurezza',
    operatore ? `Operatore riassegnato a ${operatore}.` : 'Operatore rimosso (appuntamento in presenza).'
  );
  return stampUpdate(next);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/logic/rules.test.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Commit**

```bash
cd app && git add src/logic/rules.ts src/logic/rules.test.ts
git commit -m "feat: add operatore param to confirm/rimodula, derive isRemoto, rename reassignOperator to reassignRdlc

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `logic/mockData.ts` and `logic/operators.test.ts` — generate slots + operatore

**Files:**
- Modify: `app/src/logic/mockData.ts`
- Modify: `app/src/logic/operators.test.ts`

**Interfaces:**
- Consumes: `ALL_SLOTS` from `./timeSlots` (Task 1); `Appointment.slot/slotRdlc/operatore` (Task 2).
- Produces: `generateMockTasks(count?)` unchanged signature, now emitting the new fields.

- [ ] **Step 1: Update `operators.test.ts`'s appointment literal**

Find the line building a bare `Appointment` and replace field names:
```ts
{ id: 1, cameretta: '', dataPianificazione: '', slot: '09:00', stato: 'Da Confermare', rdlc, dataRdlc: '', slotRdlc: '', operatore: '' },
```

- [ ] **Step 2: Run to verify it currently fails to compile**

Run: `cd app && npx vitest run src/logic/operators.test.ts`
Expected: FAIL to run (type error) until `mockData.ts` below is also fixed — that's fine, both are edited in this task before re-running.

- [ ] **Step 3: Update `mockData.ts`**

Replace the import line:
```ts
import { formatDate } from './dates';
import { AREAS, buildOperators } from './operators';
import { ALL_SLOTS } from './timeSlots';
import type { Appointment, AppointmentStatus, AreaFw, Note, RcStatus, Task } from '../types';
```

Remove the `FASCE` constant (`const FASCE: FasciaOraria[] = [...]`) entirely — it's replaced by `ALL_SLOTS`.

Replace `buildAppointments`:
```ts
function buildAppointments(seed: number, rcStatus: RcStatus): Appointment[] {
  const count = seed % 4; // 0..3 appointments
  const appointments: Appointment[] = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i * 17;
    const day = 1 + (s % 27);
    const month = 1 + ((s >> 3) % 12);
    const date = new Date(2026, month - 1, day);
    let stato: AppointmentStatus = pick<AppointmentStatus>(['Nuovo', 'Da Confermare', 'Da Rimodulare', 'Confermato'], s);
    // Keep appointment states consistent-ish with RC-level status.
    if (rcStatus === 'Appuntamentato') stato = 'Confermato';
    if (rcStatus === 'Non Gestito' || rcStatus === 'Nuovo') stato = 'Nuovo';
    const hasRdlc = s % 3 !== 0;
    const rdlc = hasRdlc ? pick(buildOperators(), s).name : '';
    const isLockedIn = stato === 'Confermato' || stato === 'Da Rimodulare';
    // Remote only possible once an RDLC is assigned; roughly 1 in 3 locked-in appointments go remote.
    const operatore = hasRdlc && isLockedIn && s % 3 === 0 ? pick(buildOperators(), s + 5).name : '';
    appointments.push({
      id: i + 1,
      cameretta: `Cameretta ${String.fromCharCode(65 + (s % 6))}${1 + (s % 4)}`,
      dataPianificazione: formatDate(date),
      slot: pick(ALL_SLOTS, s),
      stato,
      rdlc,
      dataRdlc: isLockedIn ? formatDate(date) : '',
      slotRdlc: isLockedIn ? pick(ALL_SLOTS, s + 1) : '',
      operatore,
    });
  }
  return appointments;
}
```

(`generateMockTasks` itself is unchanged — it only calls `buildAppointments`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/logic/mockData.test.ts src/logic/operators.test.ts 2>&1 || npx vitest run src/logic/operators.test.ts`

(There is no `mockData.test.ts` today — just confirm `operators.test.ts` passes.)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd app && git add src/logic/mockData.ts src/logic/operators.test.ts
git commit -m "feat: generate 15-minute slots and occasional operatore in mock data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `state/AppContext.tsx` — action types + dispatch wiring

**Files:**
- Modify: `app/src/state/AppContext.tsx`

**Interfaces:**
- Consumes: `rules.confirmAppt(task, apptId, operatore?)`, `rules.rimodulaAppt(task, apptId, data, slot, operatore?)`, `rules.reassignRdlc`, `rules.reassignRemoteOperator`, `rules.addAppointment(task, cameretta, data, slot)`, `rules.assignRdlc(task, apptIds, operatorName, day, slot)`, `rules.realizzazioneRimodulaAppt(task, apptId, data, slot)` — all from Task 3.
- Produces: `Action` union with `fascia` renamed to `slot: TimeSlot` on `RIMODULA_APPT`, `REALIZZAZIONE_RIMODULA_APPT`, `ADD_APPOINTMENT`, `ASSIGN_RDLC`; `operatore?: string` added to `CONFIRM_APPT` and `RIMODULA_APPT`; `REASSIGN_OPERATOR` renamed to `REASSIGN_RDLC`; new `REASSIGN_REMOTE_OPERATOR` action.

- [ ] **Step 1: Update imports and `Action` union**

Replace:
```ts
import type { FasciaOraria, Operator, Role, Task } from '../types';
```
with:
```ts
import type { Operator, Role, Task, TimeSlot } from '../types';
```

Replace the action lines:
```ts
  | { type: 'CONFIRM_APPT'; protocollo: string; apptId: number; operatore?: string }
  | { type: 'RIMODULA_APPT'; protocollo: string; apptId: number; data: string; slot: TimeSlot; operatore?: string }
  | { type: 'CONFERMA_PROPOSTA'; protocollo: string; apptId: number }
  | { type: 'REALIZZAZIONE_RIMODULA_APPT'; protocollo: string; apptId: number; data: string; slot: TimeSlot }
  | { type: 'ADD_APPOINTMENT'; protocollo: string; cameretta: string; data: string; slot: TimeSlot }
  | { type: 'DELETE_APPOINTMENT'; protocollo: string; apptId: number }
  | { type: 'ASSIGN_RDLC'; protocollo: string; apptIds: number[]; operatorName: string; day: string; slot: TimeSlot }
  | { type: 'REASSIGN_RDLC'; protocollo: string; apptId: number; operatorName: string }
  | { type: 'REASSIGN_REMOTE_OPERATOR'; protocollo: string; apptId: number; operatore: string };
```

- [ ] **Step 2: Update the reducer cases**

Replace:
```ts
    case 'CONFIRM_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.confirmAppt(t, action.apptId, action.operatore),
        'Appuntamento confermato.'
      );
    case 'RIMODULA_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.rimodulaAppt(t, action.apptId, action.data, action.slot, action.operatore),
        'Proposta di rimodulazione inviata.'
      );
    case 'CONFERMA_PROPOSTA':
      return withRuleGuard(state, action.protocollo, (t) => rules.confermaProposta(t, action.apptId), 'Proposta confermata.');
    case 'REALIZZAZIONE_RIMODULA_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.realizzazioneRimodulaAppt(t, action.apptId, action.data, action.slot),
        'Controproposta inviata.'
      );
    case 'ADD_APPOINTMENT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.addAppointment(t, action.cameretta, action.data, action.slot),
        'Appuntamento aggiunto.'
      );
    case 'DELETE_APPOINTMENT':
      return withRuleGuard(state, action.protocollo, (t) => rules.deleteAppointment(t, action.apptId), 'Appuntamento eliminato.');
    case 'ASSIGN_RDLC':
      return withBulkRuleGuard(
        state,
        action.protocollo,
        action.apptIds,
        (t, id) => rules.assignRdlc(t, [id], action.operatorName, action.day, action.slot),
        'RDLC assegnato.'
      );
    case 'REASSIGN_RDLC':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.reassignRdlc(t, action.apptId, action.operatorName),
        'RDLC riassegnato.'
      );
    case 'REASSIGN_REMOTE_OPERATOR':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.reassignRemoteOperator(t, action.apptId, action.operatore),
        action.operatore ? 'Operatore riassegnato.' : 'Operatore rimosso.'
      );
```

(This replaces the previous `CONFIRM_APPT`, `RIMODULA_APPT`, `CONFERMA_PROPOSTA`, `REALIZZAZIONE_RIMODULA_APPT`, `ADD_APPOINTMENT`, `DELETE_APPOINTMENT`, `ASSIGN_RDLC`, `REASSIGN_OPERATOR` cases block.)

- [ ] **Step 3: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep AppContext`
Expected: no output (no errors in this file). Errors will remain in component files until later tasks.

- [ ] **Step 4: Commit**

```bash
cd app && git add src/state/AppContext.tsx
git commit -m "feat: wire operatore/slot through dispatch actions, rename REASSIGN_OPERATOR to REASSIGN_RDLC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `DetailView.tsx` — Operatore column + modality selection on confirm/rimodula

**Files:**
- Modify: `app/src/components/DetailView/DetailView.tsx`
- Modify: `app/src/components/DetailView/DetailView.roundtrip.test.tsx`

**Interfaces:**
- Consumes: `TimeSlot` from `../../types`; `ALL_SLOTS` from `../../logic/timeSlots`; `isRemoto` from `../../logic/rules`; dispatch actions from Task 5 (`CONFIRM_APPT` with `operatore`, `RIMODULA_APPT` with `slot`/`operatore`, `REALIZZAZIONE_RIMODULA_APPT`/`ADD_APPOINTMENT` with `slot`).
- Produces: renders an "Operatore" column right after "RDLC"; a badge showing "In presenza"/"Da remoto"; a `confirm-appt` modal kind.

- [ ] **Step 1: Update `DetailView.roundtrip.test.tsx`'s appointment fixture fields**

Read the file's current appointment literal (around lines 40-50) and rename `fasciaOraria`→`slot`, `fasciaOrariaRdlc`→`slotRdlc`, add `operatore: ''`. Keep the same slot value shape but as a plain `"09:00"`-style string instead of the old range string.

- [ ] **Step 2: Run the roundtrip test to confirm current failures are only the ones this task fixes**

Run: `cd app && npx vitest run src/components/DetailView/DetailView.roundtrip.test.tsx`
Expected: FAIL (type/behavior mismatches) — proceed to implementation.

- [ ] **Step 3: Update `DetailView.tsx` imports and local state**

Replace:
```ts
import type { Appointment, FasciaOraria } from '../../types';
```
with:
```ts
import type { Appointment, TimeSlot } from '../../types';
```
Add:
```ts
import { ALL_SLOTS } from '../../logic/timeSlots';
import { isRemoto } from '../../logic/rules';
```

Rename local state:
```ts
  const [slot, setSlot] = useState<TimeSlot>(ALL_SLOTS[0]);
  ...
  const [modalSlot, setModalSlot] = useState<TimeSlot>(ALL_SLOTS[0]);
  const [modalOperatore, setModalOperatore] = useState('');
```
(replacing `fascia`/`setFascia` and `modalFascia`/`setModalFascia`; `modalOperatore` is new, reset in `closeModal` alongside the others.)

- [ ] **Step 4: Extend `ModalKind` and modal plumbing**

```ts
type ModalKind =
  | { kind: 'confirm-appt'; apptId: number }
  | { kind: 'realizzazione-rimodula'; apptId: number }
  | { kind: 'rimodula'; apptId: number }
  | { kind: 'rimodula-rc' }
  | { kind: 'delete-appt'; apptId: number }
  | null;
```

`closeModal` also resets `modalOperatore`:
```ts
  function closeModal() {
    setModal(null);
    setModalData('');
    setModalSlot(ALL_SLOTS[0]);
    setModalOperatore('');
    setRimodulaNote('');
  }
```

`submitModal` grows a `confirm-appt` branch and passes `operatore` through the existing two branches:
```ts
  function submitModal() {
    if (!task || !modal) return;
    if (modal.kind === 'confirm-appt') {
      dispatch({ type: 'CONFIRM_APPT', protocollo: task.protocollo, apptId: modal.apptId, operatore: modalOperatore });
    } else if (modal.kind === 'realizzazione-rimodula') {
      dispatch({
        type: 'REALIZZAZIONE_RIMODULA_APPT',
        protocollo: task.protocollo,
        apptId: modal.apptId,
        data: modalData,
        slot: modalSlot,
      });
    } else if (modal.kind === 'rimodula') {
      dispatch({
        type: 'RIMODULA_APPT',
        protocollo: task.protocollo,
        apptId: modal.apptId,
        data: modalData,
        slot: modalSlot,
        operatore: modalOperatore,
      });
    } else if (modal.kind === 'rimodula-rc') {
      dispatch({ type: 'RIMODULA_RC', protocollo: task.protocollo, note: rimodulaNote });
    } else if (modal.kind === 'delete-appt') {
      dispatch({ type: 'DELETE_APPOINTMENT', protocollo: task.protocollo, apptId: modal.apptId });
    }
    closeModal();
  }
```

`submitNewAppt` renames `fascia` to `slot`:
```ts
  function submitNewAppt() {
    if (!task || !cameretta || !data || !slot) return;
    dispatch({ type: 'ADD_APPOINTMENT', protocollo: task.protocollo, cameretta, data, slot });
    setCameretta('');
    setData('');
    setSlot(ALL_SLOTS[0]);
    setNewApptOpen(false);
  }
```

- [ ] **Step 5: Update the "Nuovo appuntamento" form (slot picker) and table header**

Replace the fascia toggle block:
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

Update the table header row: replace `<th>Fascia oraria</th>` with `<th>Slot</th>`, and insert `<th>Operatore</th>` right after `<th>RDLC</th>`:
```tsx
                  <th>Slot</th>
                  <th>Stato</th>
                  <th>RDLC</th>
                  <th>Operatore</th>
                  <th>Azioni</th>
```

- [ ] **Step 6: Wire the appointment list callbacks**

Replace the `onOpenRimodula`/`onOpenRealizzazioneRimodula` bodies (they seed `modalSlot` from `appt.slot` instead of `appt.fasciaOraria`), and change the per-row confirm handler from a direct dispatch to opening the new modal:
```tsx
                    onConfirmSicurezza={() => setModal({ kind: 'confirm-appt', apptId: appt.id })}
                    onOpenRimodula={() => {
                      setModal({ kind: 'rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalSlot(appt.slot);
                      setModalOperatore(appt.operatore);
                    }}
                    onConfermaProposta={() => dispatch({ type: 'CONFERMA_PROPOSTA', protocollo: task.protocollo, apptId: appt.id })}
                    onOpenRealizzazioneRimodula={() => {
                      setModal({ kind: 'realizzazione-rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalSlot(appt.slot);
                    }}
```

- [ ] **Step 7: Add the `confirm-appt` modal, and an Operatore select in the `rimodula` modal**

Add a new modal block (before the existing `rimodula`/`realizzazione-rimodula` block):
```tsx
      {modal?.kind === 'confirm-appt' && (
        <Modal
          title="Conferma appuntamento"
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button variant="success" onClick={submitModal}>
                Conferma
              </Button>
            </>
          }
        >
          <div className={styles.modalForm}>
            <label className={styles.formField}>
              <span>Operatore (per appuntamento da remoto)</span>
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
            </label>
          </div>
        </Modal>
      )}
```

Update the existing `rimodula`/`realizzazione-rimodula` modal: rename the fascia toggle to a slot select, and (only for `kind === 'rimodula'`, since that's the Sicurezza action) add the Operatore select:
```tsx
      {(modal?.kind === 'rimodula' || modal?.kind === 'realizzazione-rimodula') && (
        <Modal
          title={modal.kind === 'rimodula' ? 'Proponi rimodulazione' : 'Controproponi data'}
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button variant="rimodula" onClick={submitModal} disabled={!modalData}>
                Invia
              </Button>
            </>
          }
        >
          <div className={styles.modalForm}>
            <DatePickerPopover label="Nuova data" value={modalData} onChange={setModalData} id="modal-date" />
            <label className={styles.formField}>
              <span>Slot orario</span>
              <select value={modalSlot} onChange={(e) => setModalSlot(e.target.value)}>
                {ALL_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {modal.kind === 'rimodula' && (
              <label className={styles.formField}>
                <span>Operatore (per appuntamento da remoto)</span>
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
              </label>
            )}
          </div>
        </Modal>
      )}
```

- [ ] **Step 8: Update `ApptRow` to render the Operatore cell and modality badge**

In the `ApptRow` function, replace the cell rendering:
```tsx
      <td>{appt.slot}</td>
      <td>
        <StatusPill status={appt.stato} level="appointment" />
        {' '}
        <span className={styles.modalitaTag}>{isRemoto(appt) ? 'Da remoto' : 'In presenza'}</span>
      </td>
      <td>{appt.rdlc || '—'}</td>
      <td>{appt.operatore || '—'}</td>
```

- [ ] **Step 9: Add a minimal `.modalitaTag` style**

Append to `app/src/components/DetailView/DetailView.module.css`:
```css
.modalitaTag {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
}
```

- [ ] **Step 10: Run the roundtrip test**

Run: `cd app && npx vitest run src/components/DetailView/DetailView.roundtrip.test.tsx`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
cd app && git add src/components/DetailView/DetailView.tsx src/components/DetailView/DetailView.roundtrip.test.tsx src/components/DetailView/DetailView.module.css
git commit -m "feat: add Operatore column and remote-confirmation flow to DetailView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `RiassegnaView.tsx` — Operatore column + symmetric reassignment

**Files:**
- Modify: `app/src/components/RiassegnaView/RiassegnaView.tsx`

**Interfaces:**
- Consumes: `REASSIGN_RDLC` (renamed, Task 5) for the existing "Nuovo operatore" (RDLC) flow; new `REASSIGN_REMOTE_OPERATOR` action for the Operatore flow; `appt.operatore`/`appt.slot` fields.
- Produces: an added "Operatore" result column with its own select + assign action, independent of the existing RDLC reassignment row action.

- [ ] **Step 1: Extend `ResultRow` and search/state**

```ts
interface ResultRow {
  protocollo: string;
  apptId: number;
  data: string;
  slot: string;
  stato: Task['appointments'][number]['stato'];
  currentOperatore: string;
  suggested: string;
}
```

Add new state alongside `rowOperator`:
```ts
  const [rowRemoteOperator, setRowRemoteOperator] = useState<Record<number, string>>({});
  const [doneRemoteIds, setDoneRemoteIds] = useState<number[]>([]);
```

In `runSearch`, rename `fascia` to `slot` (from `a.slotRdlc || a.slot`) and populate `currentOperatore`/seed `rowRemoteOperator`:
```ts
        rows.push({
          protocollo: t.protocollo,
          apptId: a.id,
          data: effectiveDate,
          slot: a.slotRdlc || a.slot,
          stato: a.stato,
          currentOperatore: a.operatore,
          suggested: suggestion?.name ?? '',
        });
        initRowOperator[a.id] = suggestion?.name ?? '';
```
and after the loop, alongside the existing `setRowOperator(initRowOperator)`:
```ts
    setRowRemoteOperator(Object.fromEntries(rows.map((r) => [r.apptId, r.currentOperatore])));
    setDoneRemoteIds([]);
```

- [ ] **Step 2: Rename the RDLC assignment dispatch and add the Operatore one**

```ts
  function assignRow(row: ResultRow) {
    const newOp = rowOperator[row.apptId];
    if (!newOp) return;
    dispatch({ type: 'REASSIGN_RDLC', protocollo: row.protocollo, apptId: row.apptId, operatorName: newOp });
    setDoneIds((d) => [...d, row.apptId]);
  }

  function assignRemoteRow(row: ResultRow) {
    dispatch({
      type: 'REASSIGN_REMOTE_OPERATOR',
      protocollo: row.protocollo,
      apptId: row.apptId,
      operatore: rowRemoteOperator[row.apptId] ?? '',
    });
    setDoneRemoteIds((d) => [...d, row.apptId]);
  }
```

- [ ] **Step 3: Add the Operatore column to the table**

Update the header row:
```tsx
                  <th>Protocollo</th>
                  <th>Data</th>
                  <th>Slot</th>
                  <th>Stato</th>
                  <th>Nuovo RDLC</th>
                  <th>Operatore (remoto)</th>
                  <th>Azioni</th>
```

Update each `<td>{row.fascia}</td>` to `<td>{row.slot}</td>`, and after the existing "Nuovo operatore" `<td>`/assign button pair, add:
```tsx
                    <td>
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
                    </td>
                    <td>
                      <Button
                        variant="success"
                        disabled={doneRemoteIds.includes(row.apptId)}
                        onClick={() => assignRemoteRow(row)}
                      >
                        {doneRemoteIds.includes(row.apptId) ? 'Assegnato' : 'Assegna'}
                      </Button>
                    </td>
```
(the "Azioni" header now covers both the existing RDLC assign button and this new Operatore assign button — keep both action buttons in their own cells as above rather than merging headers, so the table stays two extra columns wider: "Operatore (remoto)" + its own action cell.)

- [ ] **Step 4: Type-check and manually verify no leftover `fascia`/`REASSIGN_OPERATOR` references**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep RiassegnaView`
Expected: no output.

Run: `cd app && grep -n "fascia\|REASSIGN_OPERATOR" src/components/RiassegnaView/RiassegnaView.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/components/RiassegnaView/RiassegnaView.tsx
git commit -m "feat: add Operatore column and symmetric reassignment to RiassegnaView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `RdlcDrawer.tsx` — hour columns with 15-minute slot picker

**Files:**
- Modify: `app/src/components/common/RdlcDrawer.tsx`

**Interfaces:**
- Consumes: `WORK_HOURS`, `slotsInHour` from `../../logic/timeSlots`.
- Produces: `onAssign(operatorName: string, day: string, slot: TimeSlot): void` (was `fascia: FasciaOraria`); per-operator/day cell now expands to a small popover/list of 4 slot buttons per hour instead of 2 direct fascia buttons.

- [ ] **Step 1: Update imports and props**

Replace:
```ts
import type { AreaFw, FasciaOraria, Operator } from '../../types';
```
with:
```ts
import type { AreaFw, Operator, TimeSlot } from '../../types';
```
Remove `const FASCE: FasciaOraria[] = [...]`. Add:
```ts
import { WORK_HOURS, slotsInHour } from '../../logic/timeSlots';
```

Change the `onAssign` prop type:
```ts
  onAssign: (operatorName: string, day: string, slot: TimeSlot) => void;
```

- [ ] **Step 2: Add per-cell open-hour state**

```ts
  const [openCell, setOpenCell] = useState<{ opName: string; day: string } | null>(null);
```

- [ ] **Step 3: Replace the day-cell rendering (2 fascia buttons → 8 hour buttons that expand to 4 slot buttons)**

```tsx
                {days.map((d) => {
                  const dayStr = formatDate(d);
                  const isOpen = openCell?.opName === op.name && openCell.day === dayStr;
                  return (
                    <div key={d.toISOString()} className={styles.cell}>
                      {!isOpen ? (
                        <div className={styles.hourGrid}>
                          {WORK_HOURS.map((h) => (
                            <button
                              key={h}
                              className={styles.cellBtn}
                              onClick={() => setOpenCell({ opName: op.name, day: dayStr })}
                            >
                              {String(h).padStart(2, '0')}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.slotPopover}>
                          {WORK_HOURS.flatMap((h) => slotsInHour(h)).map((s) => (
                            <button
                              key={s}
                              className={styles.slotBtn}
                              onClick={() => {
                                onAssign(op.name, dayStr, s);
                                setOpenCell(null);
                              }}
                            >
                              {s}
                            </button>
                          ))}
                          <button className={styles.slotPopoverClose} onClick={() => setOpenCell(null)}>
                            Chiudi
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
```

- [ ] **Step 4: Add the new CSS classes to `RdlcDrawer.module.css`**

Append:
```css
.hourGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
}

.slotPopover {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px;
}

.slotBtn {
  font-size: 10px;
  padding: 2px 4px;
}

.slotPopoverClose {
  grid-column: 1 / -1;
  font-size: 10px;
  color: #6b7280;
}
```

- [ ] **Step 5: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep RdlcDrawer`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/components/common/RdlcDrawer.tsx src/components/common/RdlcDrawer.module.css
git commit -m "feat: switch RdlcDrawer assignment grid to hour columns with 15-minute slot picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `CalendarioGlobaleView.tsx` — hour columns, per-slot chips, hover/click details

**Files:**
- Modify: `app/src/components/CalendarioGlobaleView/CalendarioGlobaleView.tsx`
- Modify: `app/src/components/CalendarioGlobaleView/CalendarioGlobaleView.module.css`

**Interfaces:**
- Consumes: `WORK_HOURS`, `hourOf` from `../../logic/timeSlots`; `isRemoto` from `../../logic/rules`; `Appointment` fields `slot`/`slotRdlc`/`rdlc`/`operatore`/`cameretta`, `Task.protocollo`/`cliente` (via a match object carrying the parent task, not just `appt`).
- Produces: table with 7×8 = 56 data columns (day × hour) instead of 7×2; each cell shows one chip per matching appointment labelled with its exact slot; a click/hover popover shows cliente, protocollo, RDLC, Operatore, modalità.

- [ ] **Step 1: Update imports and remove the `FASCE` constant**

Replace:
```ts
import type { AreaFw, FasciaOraria } from '../../types';
```
with:
```ts
import type { AreaFw } from '../../types';
```
Add:
```ts
import { WORK_HOURS, hourOf } from '../../logic/timeSlots';
import { isRemoto } from '../../logic/rules';
```
Remove `const FASCE: FasciaOraria[] = [...]`.

- [ ] **Step 2: Replace `cellStatuses` with a richer match type, grouped by hour**

```ts
  interface ApptMatch {
    protocollo: string;
    cliente: string;
    slot: string;
    stato: string;
    rdlc: string;
    operatore: string;
  }

  function cellMatches(operatorName: string, day: Date, hour: number): ApptMatch[] {
    const dayStr = formatDate(day);
    const matches: ApptMatch[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        const effectiveDay = a.dataRdlc || a.dataPianificazione;
        const effectiveSlot = a.slotRdlc || a.slot;
        if (a.rdlc === operatorName && effectiveDay === dayStr && hourOf(effectiveSlot) === hour) {
          matches.push({
            protocollo: t.protocollo,
            cliente: t.cliente,
            slot: effectiveSlot,
            stato: a.stato,
            rdlc: a.rdlc,
            operatore: a.operatore,
          });
        }
      }
    }
    return matches;
  }
```

- [ ] **Step 3: Add popover open-state**

```ts
  const [openMatch, setOpenMatch] = useState<ApptMatch | null>(null);
```

- [ ] **Step 4: Replace the table header rows**

```tsx
              <tr>
                <th>RDLC</th>
                {days.map((d) => (
                  <th key={d.toISOString()} colSpan={WORK_HOURS.length}>
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
              <tr>
                <th></th>
                {days.map((d) =>
                  WORK_HOURS.map((h) => (
                    <th key={d.toISOString() + h} className={styles.fasciaHeader}>
                      {String(h).padStart(2, '0')}
                    </th>
                  ))
                )}
              </tr>
```

(Header label changed from "Operatore" to "RDLC" — this row lists the RDLC pool, matching what the column actually represents; see plan constraints.)

- [ ] **Step 5: Replace the table body cells**

```tsx
              {filteredOps.map((op) => (
                <tr key={op.name}>
                  <td className={styles.opCell}>{op.name}</td>
                  {days.map((d) =>
                    WORK_HOURS.map((h) => {
                      const matches = cellMatches(op.name, d, h);
                      return (
                        <td key={d.toISOString() + h} className={styles.cell}>
                          {matches.length === 0 ? (
                            <span className={styles.libero}>Libero</span>
                          ) : (
                            <div className={styles.chipStack}>
                              {matches.map((m) => (
                                <button
                                  key={m.protocollo + m.slot}
                                  type="button"
                                  className={styles.apptChip}
                                  onMouseEnter={() => setOpenMatch(m)}
                                  onMouseLeave={() => setOpenMatch((cur) => (cur === m ? null : cur))}
                                  onClick={() => setOpenMatch((cur) => (cur === m ? null : m))}
                                >
                                  {m.slot}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
```

- [ ] **Step 6: Add the details popover, rendered once at the end of `.wrap`**

```tsx
      {openMatch && (
        <div className={styles.detailsPopover} onClick={() => setOpenMatch(null)}>
          <div className={styles.detailsCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailsRow}>
              <strong>{openMatch.protocollo}</strong> — {openMatch.cliente}
            </div>
            <div className={styles.detailsRow}>Slot: {openMatch.slot}</div>
            <div className={styles.detailsRow}>RDLC: {openMatch.rdlc || '—'}</div>
            <div className={styles.detailsRow}>Operatore: {openMatch.operatore || '—'}</div>
            <div className={styles.detailsRow}>Modalità: {isRemoto(openMatch as unknown as Parameters<typeof isRemoto>[0]) ? 'Da remoto' : 'In presenza'}</div>
            <button className={styles.detailsClose} onClick={() => setOpenMatch(null)}>
              Chiudi
            </button>
          </div>
        </div>
      )}
```

Note: `isRemoto` only reads `.operatore`, so passing the `ApptMatch` object (which carries `operatore`) works at runtime; to keep this type-clean instead of casting, change `isRemoto`'s parameter type in `logic/rules.ts` from `Appointment` to `Pick<Appointment, 'operatore'>` — do that now:
```ts
export function isRemoto(appt: Pick<Appointment, 'operatore'>): boolean {
  return !!appt.operatore;
}
```
Then drop the cast above: `isRemoto(openMatch) ? 'Da remoto' : 'In presenza'`.

- [ ] **Step 7: Add CSS for chips and popover**

Append to `CalendarioGlobaleView.module.css`:
```css
.chipStack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.apptChip {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: #DCE3FB;
  border: none;
  cursor: pointer;
}

.detailsPopover {
  position: fixed;
  inset: 0;
  background: rgba(17, 20, 26, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.detailsCard {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  min-width: 220px;
  box-shadow: 0 8px 24px rgba(17, 20, 26, 0.2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detailsRow {
  font-size: 13px;
}

.detailsClose {
  align-self: flex-end;
  font-size: 12px;
  color: #6b7280;
}
```

- [ ] **Step 8: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep CalendarioGlobaleView`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
cd app && git add src/components/CalendarioGlobaleView/CalendarioGlobaleView.tsx src/components/CalendarioGlobaleView/CalendarioGlobaleView.module.css src/logic/rules.ts
git commit -m "feat: rework CalendarioGlobaleView to hour columns with per-slot chips and details popover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `ListView.tsx` — rename `fasciaOraria` usage

**Files:**
- Modify: `app/src/components/ListView/ListView.tsx`

**Interfaces:**
- Consumes: `Appointment.slot` (Task 2).

- [ ] **Step 1: Update the single usage**

Replace:
```tsx
                    <span className={styles.apptTime}>{appt?.fasciaOraria ?? '—'}</span>
```
with:
```tsx
                    <span className={styles.apptTime}>{appt?.slot ?? '—'}</span>
```

- [ ] **Step 2: Type-check**

Run: `cd app && npx tsc -b --noEmit 2>&1 | grep ListView`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd app && git add src/components/ListView/ListView.tsx
git commit -m "refactor: rename fasciaOraria to slot in ListView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd app && npx tsc -b --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 2: Full test suite**

Run: `cd app && npx vitest run`
Expected: all test files pass (`timeSlots.test.ts`, `rules.test.ts`, `table.test.ts`, `operators.test.ts`, `DetailView.roundtrip.test.tsx`, `LoginGate.test.tsx`).

- [ ] **Step 3: Grep for stale references**

Run: `cd app && grep -rn "fasciaOraria\|FasciaOraria\|REASSIGN_OPERATOR\b" src`
Expected: no output. (`reassignOperator` as a substring inside `reassignRemoteOperator`/`REASSIGN_REMOTE_OPERATOR` is fine and expected.)

- [ ] **Step 4: Lint**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual smoke test in the running dev server**

The dev server is already running on `http://localhost:5173/` (started earlier in this session). Reload the page and check:
- ListView renders without console errors, appointment time cards show a slot like "09:15".
- Open a task as `sicurezza` role with an appointment that has `rdlc` set: DetailView table shows "Operatore" column next to "RDLC"; clicking "Conferma" opens the new modal with an Operatore select; confirming without picking one shows "In presenza"; confirming with one shows "Da remoto" and the Operatore name in its column.
- Open `RiassegnaView`, search by an operator with results, confirm the new "Operatore (remoto)" column and its "Assegna" button work independently of the RDLC column.
- Open `CalendarioGlobaleView`: the header row now spans 8 hour columns per day (56 total); hovering/clicking a chip in an occupied cell opens the details popover with cliente/RDLC/Operatore/modalità; "Libero" still shows for empty cells.
- Open the RDLC drawer (button "RDLC" in DetailView per row): the grid now shows hour buttons per day; clicking one expands to a 4-slot picker; picking a slot assigns and closes the drawer.

- [ ] **Step 6: If everything passes, this plan is complete — no further commit needed (verification only).**
