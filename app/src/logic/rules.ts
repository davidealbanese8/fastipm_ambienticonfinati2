import { formatNow, formatNowNoteTimestamp } from './dates';
import type { Appointment, Note, Task } from '../types';

export function isRealizzazioneOwner(task: Task): boolean {
  return task.stato !== 'Da Confermare' && task.stato !== 'Appuntamentato';
}

export function isSicurezzaOwner(task: Task): boolean {
  return task.stato === 'Da Confermare';
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
  if (task.appointments.length === 0) throw new RuleError('Task non di competenza in questo stato.');
  let next: Task = {
    ...task,
    appointments: task.appointments.map((a) => (a.stato === 'Nuovo' ? { ...a, stato: 'Da Confermare' } : a)),
  };
  if (next.stato === 'Non Gestito' || next.stato === 'Da Completare') {
    next = { ...next, stato: 'Da Confermare' };
  }
  return stampUpdate(next);
}

/** RC-level: Realizzazione "Conferma" (shown when RC is Da Rimodulare). */
export function confirmRealizzazione(task: Task): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (task.appointments.length === 0) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaConfermare(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (!allApptConfermato(task)) throw new RuleError('Task non di competenza in questo stato.');
  return stampUpdate({ ...task, stato: 'Appuntamentato' });
}

/** RC-level: Realizzazione "Riappuntamenta". */
export function riappuntamenta(task: Task): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (task.appointments.length === 0) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (allApptConfermato(task)) throw new RuleError('Task non di competenza in questo stato.');
  return stampUpdate({ ...task, stato: 'Da Confermare' });
}

/** RC-level: Sicurezza "Conferma". */
export function confirmRc(task: Task): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaConfermare(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaRimodulare(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (!allApptConfermato(task)) throw new RuleError('Task non di competenza in questo stato.');
  return stampUpdate({ ...task, stato: 'Appuntamentato' });
}

/** RC-level: Sicurezza "Rimodula". */
export function rimodulaRc(task: Task, noteText?: string): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (anyApptDaConfermare(task)) throw new RuleError('Task non di competenza in questo stato.');
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
export function confirmAppt(task: Task, apptId: number): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const appt = task.appointments.find((a) => a.id === apptId);
  if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Confermato',
    dataRdlc: a.dataPianificazione,
    fasciaOrariaRdlc: a.fasciaOraria,
  }));
  return stampUpdate(next);
}

/** Appointment-level: Sicurezza per-row "Rimodula" (propose new date/fascia). */
export function rimodulaAppt(task: Task, apptId: number, newData: string, newFascia: Appointment['fasciaOraria']): Task {
  if (!isSicurezzaOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const appt = task.appointments.find((a) => a.id === apptId);
  if (!appt || !appt.rdlc) throw new RuleError('Compila il campo RDLC prima di confermare/rimodulare.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Da Rimodulare',
    dataRdlc: newData,
    fasciaOrariaRdlc: newFascia,
  }));
  return stampUpdate(next);
}

/** Appointment-level: Realizzazione per-row "Conferma" (accept Sicurezza's proposal). */
export function confermaProposta(task: Task, apptId: number): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Confermato',
    dataPianificazione: a.dataRdlc || a.dataPianificazione,
    fasciaOraria: (a.fasciaOrariaRdlc as Appointment['fasciaOraria']) || a.fasciaOraria,
  }));
  return stampUpdate(next);
}

/** Appointment-level: Realizzazione per-row "Rimodula" (counter-propose). */
export function realizzazioneRimodulaAppt(
  task: Task,
  apptId: number,
  newData: string,
  newFascia: Appointment['fasciaOraria']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  const next = updateAppt(task, apptId, (a) => ({
    ...a,
    stato: 'Da Confermare',
    dataPianificazione: newData,
    fasciaOraria: newFascia,
  }));
  return stampUpdate(next);
}

/** Add a new appointment (Realizzazione-only). */
export function addAppointment(
  task: Task,
  cameretta: string,
  data: string,
  fascia: Appointment['fasciaOraria']
): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  if (!cameretta || !data || !fascia) throw new RuleError('Compila tutti i campi obbligatori.');
  const nextId = task.appointments.length ? Math.max(...task.appointments.map((a) => a.id)) + 1 : 1;
  const appt: Appointment = {
    id: nextId,
    cameretta,
    dataPianificazione: data,
    fasciaOraria: fascia,
    stato: 'Nuovo',
    rdlc: '',
    dataRdlc: '',
    fasciaOrariaRdlc: '',
  };
  return stampUpdate({ ...task, appointments: [...task.appointments, appt] });
}

/** Delete an appointment row (Realizzazione-only). */
export function deleteAppointment(task: Task, apptId: number): Task {
  if (!isRealizzazioneOwner(task)) throw new RuleError('Task non di competenza in questo stato.');
  return stampUpdate({ ...task, appointments: task.appointments.filter((a) => a.id !== apptId) });
}

/** RDLC availability drawer: assign operator+day+fascia to selected appointments. */
export function assignRdlc(
  task: Task,
  apptIds: number[],
  operatorName: string,
  day: string,
  fascia: Appointment['fasciaOraria']
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
        fasciaOrariaRdlc: fascia,
        stato: matchesPlanned ? 'Confermato' : 'Da Rimodulare',
      };
    }),
  };
  next = addNote(next, 'System Sicurezza', `RDLC ${operatorName} assegnato per il ${day} (${fascia}).`);
  return stampUpdate(next);
}

/** Riassegnazione: change only the rdlc field on the target appointment, with a note. */
export function reassignOperator(task: Task, apptId: number, newOperatorName: string): Task {
  let next = updateAppt(task, apptId, (a) => ({ ...a, rdlc: newOperatorName }));
  next = addNote(next, 'System Sicurezza', `Operatore riassegnato a ${newOperatorName}.`);
  return stampUpdate(next);
}
