import { formatNow, formatNowNoteTimestamp } from './dates';
import type { Appointment, Note, Task } from '../types';

/**
 * Realizzazione owns every state except "Da Confermare" — including "Appuntamentato":
 * once closed, only Realizzazione may still touch the RC (Sicurezza is read-only there).
 */
export function isRealizzazioneOwner(task: Task): boolean {
  return task.stato !== 'Da Confermare';
}

export function isSicurezzaOwner(task: Task): boolean {
  return task.stato === 'Da Confermare';
}

export function isRemoto(appt: Pick<Appointment, 'operatore'>): boolean {
  return !!appt.operatore;
}

export function anyApptDaConfermare(task: Task): boolean {
  return task.appointments.some((a) => a.stato === 'Da Confermare');
}

export function anyApptDaRimodulare(task: Task): boolean {
  return task.appointments.some((a) => a.stato === 'Da Rimodulare');
}

export function allApptConfermato(task: Task): boolean {
  return task.appointments.length > 0 && task.appointments.every((a) => a.stato === 'Confermato');
}

export class RuleError extends Error {}

/**
 * Every mutation funnels through here, so this is also where the "all appointments
 * confirmed ⇒ RC is Appuntamentato" invariant is enforced: as soon as every row is
 * Confermato, the RC closes on its own — no separate manual Conferma click needed.
 */
function stampUpdate(task: Task): Task {
  const closed = task.stato !== 'Appuntamentato' && allApptConfermato(task) ? { ...task, stato: 'Appuntamentato' as const } : task;
  return { ...closed, lastUpdate: formatNow() };
}

function addNote(task: Task, author: Note['author'], text: string, context?: string): Task {
  const note: Note = { author, text, timestamp: formatNowNoteTimestamp(), context };
  return { ...task, notes: [...task.notes, note] };
}

/**
 * Realizzazione editing an RC it doesn't currently need to touch reopens it:
 * - "Non Gestito" (empty grid) becomes "Da Completare" as soon as a row is saved.
 * - "Appuntamentato" (closed) becomes "Da Confermare" as soon as Realizzazione edits
 *   it, sending it back through Sicurezza's queue.
 * Every other status is left untouched — those transitions are driven by explicit
 * RC-level actions (Appuntamenta/Conferma/Riappuntamenta/Rimodula task).
 */
function reopenOnEdit(stato: Task['stato']): Task['stato'] {
  if (stato === 'Non Gestito') return 'Da Completare';
  if (stato === 'Appuntamentato') return 'Da Confermare';
  return stato;
}

/** RC-level: Realizzazione "Appuntamenta". */
export function appuntamenta(task: Task): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (task.appointments.length === 0) throw new RuleError('Aggiungi almeno un appuntamento prima di confermare.');
  let next: Task = {
    ...task,
    appointments: task.appointments.map((a) => (a.stato === 'Da Completare' ? { ...a, stato: 'Da Confermare' } : a)),
  };
  if (next.stato === 'Non Gestito' || next.stato === 'Da Completare') {
    next = { ...next, stato: 'Da Confermare' };
  }
  return stampUpdate(next);
}

/** RC-level: Realizzazione "Conferma" (shown when RC is Da Rimodulare). */
export function confirmRealizzazione(task: Task): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (task.appointments.length === 0) throw new RuleError('Aggiungi almeno un appuntamento prima di confermare.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  if (anyApptDaConfermare(task)) {
    throw new RuleError('Sono presenti appuntamenti rimodulati da verificare: usa Riappuntamenta.');
  }
  if (!allApptConfermato(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  return stampUpdate({ ...task, stato: 'Appuntamentato' });
}

/** RC-level: Realizzazione "Riappuntamenta". */
export function riappuntamenta(task: Task): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (task.appointments.length === 0) throw new RuleError('Aggiungi almeno un appuntamento prima di confermare.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  if (allApptConfermato(task)) throw new RuleError('Tutti gli appuntamenti sono confermati: usa Conferma.');
  return stampUpdate({ ...task, stato: 'Da Confermare' });
}

/** RC-level: Sicurezza "Conferma". */
export function confirmRc(task: Task): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaConfermare(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  if (!allApptConfermato(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  return stampUpdate({ ...task, stato: 'Appuntamentato' });
}

/** RC-level: Sicurezza "Rimodula". */
export function rimodulaRc(task: Task, noteText?: string): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaConfermare(task)) throw new RuleError('Esegui prima un’azione su tutti gli appuntamenti.');
  let next: Task = { ...task, stato: 'Da Rimodulare' };
  if (noteText && noteText.trim()) {
    next = addNote(next, 'System Sicurezza', noteText.trim());
    next = { ...next, pendingSicurezzaNote: true };
  }
  return stampUpdate(next);
}

function updateAppt(task: Task, id: number, updater: (a: Appointment) => Appointment): Task {
  return {
    ...task,
    appointments: task.appointments.map((a) => (a.id === id ? updater(a) : a)),
  };
}

/** Appointment-level: Sicurezza per-row "Conferma". */
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

/** Appointment-level: Sicurezza per-row "Rimodula" (propose new date/slot). */
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

/**
 * Bulk version of confirmAppt: validates that EVERY selected row has an RDLC before
 * touching any of them, so a multi-selection with even one missing RDLC is rejected
 * as a whole rather than partially applied.
 */
export function confirmApptsBulk(task: Task, apptIds: number[], operatore: string = ''): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  for (const id of apptIds) {
    const appt = task.appointments.find((a) => a.id === id);
    if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  }
  let next = task;
  for (const id of apptIds) next = confirmAppt(next, id, operatore);
  return next;
}

/** Bulk version of rimodulaAppt: same all-or-nothing RDLC validation as confirmApptsBulk. */
export function rimodulaApptsBulk(
  task: Task,
  apptIds: number[],
  newData: string,
  newSlot: Appointment['slot'],
  operatore: string = ''
): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  for (const id of apptIds) {
    const appt = task.appointments.find((a) => a.id === id);
    if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  }
  let next = task;
  for (const id of apptIds) next = rimodulaAppt(next, id, newData, newSlot, operatore);
  return next;
}

/** Appointment-level: Realizzazione per-row "Conferma" (accept Sicurezza's proposal). */
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

/** Bulk version of confermaProposta (Realizzazione, multi-selection). */
export function confermaPropostaBulk(task: Task, apptIds: number[]): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  let next = task;
  for (const id of apptIds) next = confermaProposta(next, id);
  return next;
}

/**
 * Appointment-level: Realizzazione per-row "Rimodula" (counter-propose).
 * Realizzazione never decides the modalità (presenza/da remoto) — it only re-sends the
 * appointment with a new date/slot, so `operatore` (and the modalità derived from it) is
 * left untouched here; only Sicurezza's own actions (confirmAppt/rimodulaAppt/assignRdlc/
 * reassignRdlc/reassignRemoteOperator) ever set or clear it.
 */
function applyRealizzazioneRimodula(task: Task, apptId: number, newData: string, newSlot: Appointment['slot']): Task {
  return updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Da Confermare',
    dataPianificazione: newData,
    slot: newSlot,
  }));
}

export function realizzazioneRimodulaAppt(
  task: Task,
  apptId: number,
  newData: string,
  newSlot: Appointment['slot']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const next = applyRealizzazioneRimodula(task, apptId, newData, newSlot);
  // Invariant: an RC can never contain a "Da Confermare" row without being "Da
  // Confermare" itself — this also covers "Realizzazione edits an Appuntamentato RC".
  return stampUpdate({ ...next, stato: 'Da Confermare' });
}

/** Bulk version of realizzazioneRimodulaAppt (same new date/slot applied to every selected row). */
export function realizzazioneRimodulaApptsBulk(
  task: Task,
  apptIds: number[],
  newData: string,
  newSlot: Appointment['slot']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  let next = task;
  for (const id of apptIds) next = applyRealizzazioneRimodula(next, id, newData, newSlot);
  return stampUpdate({ ...next, stato: 'Da Confermare' });
}

/** Add a new appointment (Realizzazione-only). */
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
    stato: 'Da Completare',
    rdlc: '',
    dataRdlc: '',
    slotRdlc: '',
    operatore: '',
  };
  return stampUpdate({ ...task, stato: reopenOnEdit(task.stato), appointments: [...task.appointments, appt] });
}

/**
 * Delete an appointment row (Realizzazione-only).
 * Once the RC has been sent (anything past "Non Gestito"/"Da Completare"), it can never
 * be left with zero appointments — an RC "Da Rimodulare"/"Da Confermare"/"Appuntamentato"
 * with an empty grid is an invalid, inconsistent state.
 */
export function deleteAppointment(task: Task, apptId: number): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const remaining = task.appointments.filter((a) => a.id !== apptId);
  if (remaining.length === 0 && task.stato !== 'Non Gestito' && task.stato !== 'Da Completare') {
    throw new RuleError('Non puoi eliminare l’ultimo appuntamento di un RC già inviato.');
  }
  return stampUpdate({ ...task, stato: reopenOnEdit(task.stato), appointments: remaining });
}

/** RDLC availability drawer: assign operator+day+slot to selected appointments. */
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
        operatore: '',
      };
    }),
  };
  next = addNote(next, 'System Sicurezza', `RDLC ${operatorName} assegnato per il ${day} (${slot}).`);
  return stampUpdate(next);
}

/** Riassegnazione: change the rdlc field on the target appointment, resetting operatore (a new RDLC re-decides modality). */
export function reassignRdlc(task: Task, apptId: number, newRdlcName: string): Task {
  let next = updateAppt(task, apptId, (a) => ({ ...a, rdlc: newRdlcName, operatore: '' }));
  next = addNote(next, 'System Sicurezza', `RDLC riassegnato a ${newRdlcName}.`);
  return stampUpdate(next);
}

/**
 * Riassegnazione: set or clear (empty string) the Operatore, without touching rdlc.
 * An Operatore can never exist without an RDLC already assigned — same invariant as
 * confirmAppt/rimodulaAppt.
 */
export function reassignRemoteOperator(task: Task, apptId: number, operatore: string): Task {
  if (operatore) {
    const appt = task.appointments.find((a) => a.id === apptId);
    if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di assegnare un Operatore.');
  }
  let next = updateAppt(task, apptId, (a) => ({ ...a, operatore }));
  next = addNote(
    next,
    'System Sicurezza',
    operatore ? `Operatore riassegnato a ${operatore}.` : 'Operatore rimosso (appuntamento in presenza).'
  );
  return stampUpdate(next);
}
