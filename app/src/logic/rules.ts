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

/**
 * Whether Realizzazione may act on one specific appointment. Ownership is normally
 * task-wide (isRealizzazioneOwner) — but a row Sicurezza has just rimodulata ("Da
 * Rimodulare") bounces back to Realizzazione immediately, even while the RC itself
 * is still "Da Confermare" and Sicurezza owns every other row in it.
 */
export function canRealizzazioneActOnAppt(task: Task, apptId: number): boolean {
  if (isRealizzazioneOwner(task)) return true;
  return task.appointments.find((a) => a.id === apptId)?.stato === 'Da Rimodulare';
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
 * RC-level stato is only ever changed by the explicit RC-level actions below
 * (Appuntamenta/Conferma/Riappuntamenta/Rimodula task, all triggered from the button
 * row next to the RC title) — never as a side effect of row-level changes (assigning
 * an RDLC/Operatore, adding/deleting/rimodula-ing a single appointment, etc.).
 */
function stampUpdate(task: Task): Task {
  return { ...task, lastUpdate: formatNow() };
}

function addNote(task: Task, author: Note['author'], text: string, context?: string): Task {
  const note: Note = { author, text, timestamp: formatNowNoteTimestamp(), context };
  return { ...task, notes: [...task.notes, note] };
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

/**
 * Appointment-level: Realizzazione per-row "Rimodula" (counter-propose).
 * Realizzazione never decides the modalità (presenza/da remoto) — it only re-sends the
 * appointment with a new date/slot, so `operatore` (and the modalità derived from it) is
 * left untouched here; only Sicurezza's own actions (confirmAppt/rimodulaAppt/assignRdlc/
 * reassignRdlc/reassignOperatore) ever set or clear it. This also never touches the
 * RC-level stato — Riappuntamenta (the top-box button) is what sends the RC back to
 * Sicurezza once every controproposta has been sent.
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
  if (!canRealizzazioneActOnAppt(task, apptId)) throw new RuleError('Task non di competenza in questo stato.');
  return stampUpdate(applyRealizzazioneRimodula(task, apptId, newData, newSlot));
}

/** Bulk version of realizzazioneRimodulaAppt (same new date/slot applied to every selected row). */
export function realizzazioneRimodulaApptsBulk(
  task: Task,
  apptIds: number[],
  newData: string,
  newSlot: Appointment['slot']
): Task {
  for (const id of apptIds) {
    if (!canRealizzazioneActOnAppt(task, id)) throw new RuleError('Task non di competenza in questo stato.');
  }
  let next = task;
  for (const id of apptIds) next = applyRealizzazioneRimodula(next, id, newData, newSlot);
  return stampUpdate(next);
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
  return stampUpdate({ ...task, appointments: [...task.appointments, appt] });
}

/**
 * Delete an appointment row (Realizzazione-only).
 * Once the RC has been sent (anything past "Non Gestito"/"Da Completare"), it can never
 * be left with zero appointments — an RC "Da Rimodulare"/"Da Confermare"/"Appuntamentato"
 * with an empty grid is an invalid, inconsistent state.
 */
export function deleteAppointment(task: Task, apptId: number): Task {
  if (!canRealizzazioneActOnAppt(task, apptId)) throw new RuleError('Task non di competenza in questo stato.');
  const remaining = task.appointments.filter((a) => a.id !== apptId);
  if (remaining.length === 0 && task.stato !== 'Non Gestito' && task.stato !== 'Da Completare') {
    throw new RuleError('Non puoi eliminare l’ultimo appuntamento di un RC già inviato.');
  }
  return stampUpdate({ ...task, appointments: remaining });
}

/**
 * RDLC availability drawer: assign operator+day+slot to selected appointments.
 * Assigning an RDLC never changes the appointment's stato by itself — that only
 * happens through the row buttons (Conferma/Rimodula) or the bulk toolbar above the
 * datagrid.
 */
export function assignRdlc(
  task: Task,
  apptIds: number[],
  rdlcName: string,
  day: string,
  slot: Appointment['slot']
): Task {
  let next: Task = {
    ...task,
    appointments: task.appointments.map((a) => {
      if (!apptIds.includes(a.id)) return a;
      return {
        ...a,
        rdlc: rdlcName,
        dataRdlc: day,
        slotRdlc: slot,
        operatore: '',
      };
    }),
  };
  next = addNote(next, 'System Sicurezza', `RDLC ${rdlcName} assegnato per il ${day} (${slot}).`);
  return stampUpdate(next);
}

/** Riassegnazione: change the rdlc field on the target appointment, resetting operatore (a new RDLC re-decides modality). */
export function reassignRdlc(task: Task, apptId: number, newRdlcName: string): Task {
  // An RDLC can never be cleared once assigned — Confermato/Da Rimodulare rows require
  // one at all times (same invariant confirmAppt/rimodulaAppt enforce on the way in).
  if (!newRdlcName) throw new RuleError('Seleziona un RDLC.');
  let next = updateAppt(task, apptId, (a) => ({ ...a, rdlc: newRdlcName, operatore: '' }));
  next = addNote(next, 'System Sicurezza', `RDLC riassegnato a ${newRdlcName}.`);
  return stampUpdate(next);
}

/**
 * Riassegnazione: set or clear (empty string) the Operatore, without touching rdlc.
 * An Operatore can never exist without an RDLC already assigned — same invariant as
 * confirmAppt/rimodulaAppt.
 */
export function reassignOperatore(task: Task, apptId: number, operatore: string): Task {
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
