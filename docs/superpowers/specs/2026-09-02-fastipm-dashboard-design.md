# FASTipm Dashboard — implementation design

Date: 2026-09-02
Source: Claude Design handoff bundle at `dashboard-fastipm/project/` (`Dashboard.dc.html` + `support.js`), read in full. This spec translates that pixel-perfect prototype into a real React/TypeScript codebase.

## Goal

Rebuild the FASTipm task/appointment scheduling dashboard (roles: "Realizzazione" and "Sicurezza") as a real, maintainable frontend application, matching the prototype's visuals and interaction/business rules faithfully, with no backend (mock in-memory data) and a simple password gate in front of it.

## Non-goals

- No backend/API/persistence — all data is in-memory mock state, reset on reload.
- No real authentication/authorization — the login gate is a deterrent for a shared link, not a security boundary.
- No feature not present (or explicitly approved as an addition) in the prototype: no manual note composer, no appointment row "edit" action, no "bulk calendar" reschedule modal, no editable detail fields (see Decisions below).

## Decisions (resolved ambiguities from the source prototype)

1. **Notes**: auto-generated only, by system actions (rimodula, riassegna, etc.). No manual note-composer UI, even though the prototype's dead logic supports one.
2. **Orphaned features**: drop both the unreachable per-row "edit appointment" modal and the unreachable "bulk calendar" reschedule modal — neither has a triggering button in the prototype.
3. **Detail fields** (System Realizzazione, System Sicurezza, Cliente, Città, Provincia, Regione, Area FW): stay read-only, matching current behavior. "Salva" can be dropped or kept as a no-op toast.
4. **Bug fixes to make during rebuild** (clear prototype bugs, not open questions):
   - Table sorting must parse dates/known types correctly instead of naive `localeCompare` on stringified values (prototype sorts `lastUpdate` lexicographically, which is wrong for `DD/MM/YYYY HH:mm`).
   - `riAllDone` must reflect real completion state (`riRows.every(r => r.done)`), not be hardcoded `true`.
   - `lastUpdate` should be stamped on state-changing actions (confirm, rimodula, add/edit appointment, etc.) instead of staying static forever.
5. **Role persistence**: role stays reset to `'realizzazione'` on reload (matches prototype) — no auth/session tie-in since there's no backend.
6. **New addition (not in prototype)**: a login gate in front of the whole app.
   - `LoginGate` wraps the app; shows a centered password form styled consistent with the dashboard (Sora font, brand palette).
   - Hardcoded password: `"Settembre"`, checked client-side.
   - On success, sets a flag in `sessionStorage` so the same browser tab doesn't re-prompt until it's closed.
   - Wrong password shows an inline error. No lockout/rate-limiting.
   - Explicitly **not real security** (this is a static, frontend-only bundle — the check ships in the JS) — purpose is to keep a shared Vercel link from being freely browsable, not to protect sensitive data.

## Architecture

- **Stack**: Vite + React 18 + TypeScript. No backend.
- **State management**: single `AppProvider` (React Context + `useReducer`) with typed state slices:
  - `role: 'realizzazione' | 'sicurezza'`
  - `nav: { view, currentProtocollo, ... }`
  - `tasks: Record<string, Task>` (mock data store, mutated via reducer actions)
  - `ui: { modal, toast, errorModal, filters, selection, datePicker, ... }`
  - Derived data (filtered/sorted/paginated rows, per-row permission flags, RC/appointment ownership) computed via `useMemo` selectors — never stored, to avoid the prototype's manual `renderVals()` recomputation pattern turning into stale-state bugs.
- **Routing**: none — `view` is in-memory state (`'list' | 'detail' | 'calendarioGlobale' | 'riassegna'`), matching the prototype (no deep-linking today).
- **Styling**: CSS Modules per component + a shared `tokens.ts` exporting the color/spacing/typography constants extracted from the prototype (see Design tokens below). Sora font via Google Fonts.
- **Icons**: `@phosphor-icons/react` (React component package) instead of the prototype's CDN web-component script.

## Design tokens (from prototype, exhaustive)

**Chrome / brand**
- Page bg `#F4F5F7`, card bg `#FFFFFF`
- Dark/logo/primary text `#1d2027`
- Brand orange `#FFB430`
- Header gradient bar: `linear-gradient(90deg, #FFB430, #F06292, #BA68C8, #7986CB, #4FC3F7)`
- Text secondary: `#6b7280`, `#374151`, `#9ca3af`, `#4b5563`
- Borders: `#e5e7eb`, `#f0f1f3`, `#d1d5db`

**Status colors** (`bg`/`text` pairs, shared table for RC-level and appointment-level status, but kept as two distinct TS types — see Data model):
| Status | bg | text |
|---|---|---|
| Non Gestito | `#E5E7EB` | `#4B5563` |
| Da Completare | `#FDECC8` | `#9A6400` |
| Da Confermare | `#F8D7E8` | `#B23A72` |
| Confermato | `#DCE3FB` | `#4657C4` |
| Nuovo | `#EEF0F2` | `#4b5563` |
| Da Rimodulare | `#EAE0FB` | `#6D28D9` |
| Appuntamentato | `#15803D` (solid bg) | `#FFFFFF` |

Note: at the appointment level, status `Confermato` displays as label **"Appuntamentato"** (`displayLabel(status, level)` helper) — this is a *label* remap only, the color stays the `Confermato` row above.

**Action/semantic colors**
- Success/Conferma: bg `#EAFBEF`, border `#CDEBD6`, text `#15803D`
- Rimodula: bg `#F4EEFE`, border `#E3D6FA`, text `#6D28D9`
- Delete/danger: bg `#FDECEC`, border `#FBD5D5`, text `#C0392B` (delete-confirm button `#dc2626`)
- RDLC/availability: bg `#EEF2FF`, border `#C7D2FE`, text `#4657C4`
- Amber highlight (jump-day/badge): bg `#FFF4E0`, border `#FFE0A3`, text `#B8720B`
- Quick-action cards: Calendario `#EEF1FC`/`#e3e7f7`; Riassegna `#F4EEFE`/`#E3D6FA`
- Detail header card: bg `#FDF1DD`, border `#FBE2BB`
- Notes alternating cards: `#FBF7E9`/`#F1E4B8` (odd), `#EEF2FA`/`#DCE3FB` (even)
- Toast: bg `#1d2027`, text white
- Modal scrim: `rgba(17,20,26,0.45)`; drawer scrim `rgba(17,20,26,0.35)`
- Protocollo link color: `#5B6BF5`

**Typography**: Sora (400/500/600/700/800), fallback `-apple-system, 'Segoe UI', Arial, sans-serif`. Page/detail titles 22–26px/700–800; section headers 16–24px/700; body/table text 12–14px; status pills 10.5–12px/pill radius 20px; buttons 13–14px/700.

**Spacing/sizing**: card radius 14px, input/button radius ~10px, small controls 8px, pills 20px (full). Main content padding `24px 40px 40px`; header padding `16px 32px`. Icon buttons 30–48px depending on context. Gaps: 8/10/12/14/16/18/20/22/24px used contextually.

**Icons** (Phosphor, exhaustive list used by the prototype): gear, shield-check, hard-hat, calendar-blank, map-pin, magnifying-glass, arrows-down-up, caret-double-left, caret-left, caret-right, caret-double-right, check-circle, calendar-check, chat-text, info, arrows-clockwise, plus, check, trash, caret-up, caret-down, calendar-dots, star-fill, warning-circle, x, arrow-right.

## Data model

```ts
type RcStatus = 'Non Gestito' | 'Da Completare' | 'Da Confermare' | 'Confermato' | 'Nuovo' | 'Da Rimodulare' | 'Appuntamentato';
type AppointmentStatus = 'Nuovo' | 'Da Confermare' | 'Da Rimodulare' | 'Confermato';
type AreaFw = 'Nord Est' | 'Nord Ovest' | 'Centro' | 'Sud';
type FasciaOraria = '09:00 - 13:00' | '14:00 - 18:00';

interface Task {
  protocollo: string;           // primary key, e.g. 'RC0123457'
  stato: RcStatus;
  lastUpdate: string;           // 'DD/MM/YYYY HH:mm', stamped on state-changing actions
  systemRealizzazione: string;
  systemSicurezza: string;
  cliente: string;
  citta: string;
  provincia: string;            // constant 'Salerno' in mock data
  regione: string;               // constant 'Campania' in mock data
  areaFw: AreaFw;
  appointments: Appointment[];
  notes: Note[];
  pendingSicurezzaNote: boolean; // auto-opens notes modal for Realizzazione on next open
}
// taskId is derived: 'TASK' + protocollo.replace('RC', '')

interface Appointment {
  id: number;
  cameretta: string;
  dataPianificazione: string;    // 'DD/MM/YYYY'
  fasciaOraria: FasciaOraria;
  stato: AppointmentStatus;
  rdlc: string;                  // assigned operator name, '' if unassigned
  dataRdlc: string;              // '' or 'DD/MM/YYYY'
  fasciaOrariaRdlc: FasciaOraria | '';
}

interface Note {
  author: 'System Sicurezza' | 'System Realizzazione';
  text: string;
  timestamp: string;             // 'DD/MM/YYYY - HH:mm'
  context?: string;
}

interface Operator {
  name: string;
  area: AreaFw;
}
```

Mock data: 45 seed tasks (constant `provincia: 'Salerno'`, `regione: 'Campania'`), 25 operators across 4 areas (Nord Est 5, Nord Ovest 5, Centro 5, Sud 10). Appointment seeding logic in the prototype is purely for demo variety (string-hash based) — the rebuild can use any deterministic seed generator producing a similarly varied initial state; exact seed values don't need to match the prototype.

## Views

### AppShell (always rendered post-login)
Header: logo (dark 34×34 rounded square + 🦋 + "FAST"+"ipm" wordmark), gear icon (decorative, no handler — matches prototype), avatar button (role initial) opening a dropdown with the single role-switch action. 4px gradient bar under header.

### ListView (`view === 'list'`)
- Realizzazione: date header + hidden native date input overlay (calendar icon) driving `headerDateLabel`; row of 3 "today's appointment" cards (time, status pill, taskId, protocollo, address) linking to detail view.
- Sicurezza: "Azioni rapide" — Calendario / Riassegna appuntamenti link-cards.
- Shared: status filter chips (role-specific sets — Realizzazione: Tutti/Non Gestito/Da Completare/Da Confermare/Da Rimodulare/Appuntamentato; Sicurezza: Tutti/Da Confermare/Da Rimodulare/Appuntamentato, and Sicurezza's row set is always pre-filtered to only these 3 statuses), free-text search, 10-column sortable+per-column-filterable table (Protocollo RC 12%, Stato 12%, Last Update 11%, System Realizzazione 12%, System Sicurezza 12%, Cliente 12%, Città 10%, Provincia 8%, Regione 8%, Area FW 8%), pagination (page size 8, first/prev/numbered/next/last).

### DetailView (`view === 'detail'`)
- Amber header card: back caret, protocollo, status pill, notes-history icon, role-specific action buttons, accordion toggle → 4-col grid of extra fields (Last Update, System Realizzazione, System Sicurezza, Cliente, Città, Provincia, Regione, Area FW), read-only.
- `ownerNote` banner when current role doesn't own the task in its current status.
- Realizzazione actions: "Salva" (no-op/dropped per Decision 3), then "Conferma"+"Riappuntamenta" (if `stato === 'Da Rimodulare'`) or "Appuntamenta" — disabled unless owner.
- Sicurezza actions: "Conferma", "Rimodula" — disabled unless owner, or if any appointment still `Da Confermare`.
- Realizzazione-only "Nuovo appuntamento" accordion (Cameretta, Data appuntamento, Fascia 09-13/14-18 toggle, Aggiungi) with required-field validation.
- "Appuntamenti" section with role-specific bulk toolbar and per-role appointment table (see Business rules below for per-row/bulk action gating). Empty state message when no appointments.

### CalendarioGlobaleView (`view === 'calendarioGlobale'`, Sicurezza entry point)
Area filter + operator search, week navigation with a month date-picker "Vai a giorno" jump, grid of operators × 7 weekdays × 2 fasce, each cell showing status-count pills or "Libero". Empty state when no operators match filters.

### RiassegnaView (`view === 'riassegna'`, Sicurezza entry point)
Search form (operator autocomplete grouped by area, from/to date pickers, disabled until all set), results table (checkbox, Protocollo, Data, Fascia, Stato, Nuovo operatore select pre-filled with a least-loaded suggestion, per-row Assegna), bulk assign, "Conferma riassegnazione" opening a summary confirm modal that clears "done" rows. Empty state when no results.

### Modals / overlays
Toast (auto-dismiss ~2.2s), Notes modal (read-only history, no composer per Decision 1), RDLC availability drawer (per-operator week grid, click-to-assign, highlights currently assigned operator), Error modal (generic "Attenzione" dialog for rule violations), generic action Modal (delete confirm / new-appointment-style edit forms for realizzazione-rimodula, rimodula, rimodula-rc — **not** the dropped edit/bulk-calendar types per Decision 2), Riassegnazione confirm modal, reusable DatePickerPopover (single component replacing the prototype's 5 ad-hoc targets: task detail new-appointment form, RDLC drawer jump, Calendario jump, Riassegna from/to).

### LoginGate
Centered password form (Sora font, brand colors), password `"Settembre"`, `sessionStorage` flag on success, inline error on failure. Wraps `AppShell`; nothing else renders until passed.

## Business rules (state machine — ported from prototype, bug-fixed per Decision 4)

**Ownership**
- `isRealizzazioneOwner(task)`: `stato` is not `Da Confermare` and not `Appuntamentato`.
- `isSicurezzaOwner(task)`: `stato === 'Da Confermare'`.
- Acting on a task you don't own → error modal "Task non di competenza in questo stato."; Sicurezza additionally blocked from RC-level confirm/rimodula while any appointment is still `Da Confermare`.

**RC-level actions**
- `appuntamenta`: owner + non-empty appointment list → every `Nuovo` appointment → `Da Confermare`; if RC was `Non Gestito`/`Da Completare` → RC → `Da Confermare`.
- `confirmRealizzazione` ("Conferma", shown when RC `Da Rimodulare`): owner, non-empty, no appt `Da Rimodulare`, no appt `Da Confermare`, all `Confermato` → RC → `Appuntamentato`.
- `riappuntamenta` ("Riappuntamenta"): owner, non-empty, no appt `Da Rimodulare`, not all confirmed → RC → `Da Confermare`.
- `confirmRc` (Sicurezza "Conferma"): owner, no appt `Da Rimodulare`, all `Confermato` → RC → `Appuntamentato`.
- `rimodulaRc` (Sicurezza "Rimodula"): owner, no appt `Da Confermare` → RC → `Da Rimodulare`, optional note appended (sets `pendingSicurezzaNote` if non-empty).

**Appointment-level actions**
- `confirmAppt` (Sicurezza per-row "Conferma"): owner + `rdlc` non-empty → appt → `Confermato`, locks `dataRdlc`/`fasciaOrariaRdlc` = current planned values.
- `openRimodulaModal`→confirm (Sicurezza per-row "Rimodula"): owner + `rdlc` non-empty → appt → `Da Rimodulare`, sets `dataRdlc`/`fasciaOrariaRdlc` to proposed values (planned fields untouched).
- `confermaProposta` (Realizzazione per-row "Conferma", shown only when appt `Da Rimodulare`): owner → appt → `Confermato`, copies `dataRdlc/fasciaOrariaRdlc` into `dataPianificazione/fasciaOraria`.
- `openRealizzazioneRimodulaModal`→confirm (Realizzazione per-row "Rimodula"/counter-propose): appt → `Da Confermare`, updates `dataPianificazione/fasciaOraria`.
- Bulk equivalents mirror single-row rules over `selectedApptIds`; bulk Sicurezza confirm/rimodula requires every selected row to already have `rdlc` filled, else error "Compila il campo RDLC prima di confermare/rimodulare."
- New appointment: Realizzazione-only, owner-gated, all 3 fields (cameretta, data, fascia) required, starts `stato: 'Nuovo'`.
- Row delete: Realizzazione-only, owner-gated.

**RDLC availability assignment**: requires selection; assigns clicked operator+day+fascia to selected appointments; if clicked day matches the appointment's current planned date → appt → `Confermato`, else → `Da Rimodulare`; always appends an auto note.

**Riassegnazione**: search by operator+date range across all tasks (effective date = `dataRdlc || dataPianificazione`); suggests replacement via least-loaded-operator-in-area heuristic; per-row or bulk "Assegna" only changes `rdlc` (no status change), appends a note; confirm modal clears "done" rows from results (UI bookkeeping only — writes already applied on Assegna).

**Bug fixes vs. prototype** (see Decision 4): real chronological sort for date-like columns; `riAllDone` computed from actual row completion; `lastUpdate` stamped on every state-changing action.

## Testing plan

- Vitest + React Testing Library.
- Unit tests: ownership/ status-transition pure functions, `DataTable` filter/sort/paginate logic, least-loaded-operator suggestion heuristic, date parsing/sort correctness.
- Integration/interaction tests (RTL): login gate (correct/incorrect password, session persistence), Realizzazione appuntamenta→confirm round trip, Sicurezza confirm/rimodula round trip, bulk actions with pre-check errors, new-appointment validation, RDLC availability assignment updating status correctly.
- No e2e framework — component/interaction tests cover the workflow paths given the app has no backend/network layer to integration-test against.

## Open risks / follow-ups

- Exact mock data need not match the prototype's seed values (Decision-adjacent note above) — implementation should produce a similarly varied, plausible initial dataset (draws across all statuses/areas/operators) rather than reproducing the prototype's specific hash-seeded rows.
- `provincia`/`regione` constants (`Salerno`/`Campania`) are carried over as-is; if this expands beyond a single-province pilot later, that's a future data-model change, out of scope here.
