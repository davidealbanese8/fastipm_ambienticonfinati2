import { describe, expect, it } from 'vitest';
import {
  RuleError,
  addAppointment,
  appuntamenta,
  assignRdlc,
  confirmAppt,
  confirmApptsBulk,
  confirmRc,
  confirmRealizzazione,
  deleteAppointment,
  isRemoto,
  isRealizzazioneOwner,
  isSicurezzaOwner,
  realizzazioneRimodulaAppt,
  realizzazioneRimodulaApptsBulk,
  reassignRdlc,
  reassignRemoteOperator,
  rimodulaApptsBulk,
  rimodulaRc,
} from './rules';
import type { Appointment, Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    protocollo: 'RC0000001',
    stato: 'Non Gestito',
    lastUpdate: '01/01/2026 10:00',
    systemRealizzazione: 'SYS-R-1',
    systemSicurezza: 'SYS-S-1',
    cliente: 'Cliente Test',
    citta: 'Salerno',
    provincia: 'Salerno',
    regione: 'Campania',
    areaFw: 'Centro',
    appointments: [],
    notes: [],
    pendingSicurezzaNote: false,
    ...overrides,
  };
}

function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    cameretta: 'Cameretta A1',
    dataPianificazione: '10/09/2026',
    slot: '09:00',
    stato: 'Da Completare',
    rdlc: '',
    dataRdlc: '',
    slotRdlc: '',
    operatore: '',
    ...overrides,
  };
}

describe('ownership', () => {
  it('realizzazione owns everything except Da Confermare, including Appuntamentato (closed RCs stay Realizzazione-editable)', () => {
    expect(isRealizzazioneOwner(makeTask({ stato: 'Non Gestito' }))).toBe(true);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Da Rimodulare' }))).toBe(true);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Da Confermare' }))).toBe(false);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Appuntamentato' }))).toBe(true);
  });

  it('sicurezza owns only Da Confermare', () => {
    expect(isSicurezzaOwner(makeTask({ stato: 'Da Confermare' }))).toBe(true);
    expect(isSicurezzaOwner(makeTask({ stato: 'Non Gestito' }))).toBe(false);
  });
});

describe('appuntamenta (RC-level, Realizzazione)', () => {
  it('throws when not owner', () => {
    const task = makeTask({ stato: 'Da Confermare', appointments: [makeAppt()] });
    expect(() => appuntamenta(task)).toThrow(RuleError);
  });

  it('throws when no appointments', () => {
    const task = makeTask({ stato: 'Non Gestito', appointments: [] });
    expect(() => appuntamenta(task)).toThrow(RuleError);
  });

  it('moves Da Completare appointments to Da Confermare and RC to Da Confermare, stamping lastUpdate', () => {
    const task = makeTask({ stato: 'Non Gestito', appointments: [makeAppt({ stato: 'Da Completare' })], lastUpdate: 'stale' });
    const next = appuntamenta(task);
    expect(next.stato).toBe('Da Confermare');
    expect(next.appointments[0].stato).toBe('Da Confermare');
    expect(next.lastUpdate).not.toBe('stale');
  });
});

describe('confirmRealizzazione', () => {
  it('requires all appointments Confermato with no Da Rimodulare/Da Confermare', () => {
    const task = makeTask({ stato: 'Da Rimodulare', appointments: [makeAppt({ stato: 'Confermato' })] });
    const next = confirmRealizzazione(task);
    expect(next.stato).toBe('Appuntamentato');
  });

  it('rejects if any appointment still Da Confermare', () => {
    const task = makeTask({ stato: 'Da Rimodulare', appointments: [makeAppt({ stato: 'Da Confermare' })] });
    expect(() => confirmRealizzazione(task)).toThrow(RuleError);
  });
});

describe('sicurezza RC-level actions', () => {
  it('confirmRc requires ownership and all appointments confirmed', () => {
    const owned = makeTask({ stato: 'Da Confermare', appointments: [makeAppt({ stato: 'Confermato' })] });
    expect(confirmRc(owned).stato).toBe('Appuntamentato');

    const notOwned = makeTask({ stato: 'Non Gestito', appointments: [makeAppt({ stato: 'Confermato' })] });
    expect(() => confirmRc(notOwned)).toThrow(RuleError);
  });

  it('rimodulaRc appends a note and sets pendingSicurezzaNote when note provided', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, stato: 'Confermato' }), makeAppt({ id: 2, stato: 'Da Rimodulare' })],
    });
    const next = rimodulaRc(task, 'servono chiarimenti');
    expect(next.stato).toBe('Da Rimodulare');
    expect(next.notes).toHaveLength(1);
    expect(next.pendingSicurezzaNote).toBe(true);
  });

  it('rimodulaRc rejects if any appointment is Da Confermare', () => {
    const task = makeTask({ stato: 'Da Confermare', appointments: [makeAppt({ stato: 'Da Confermare' })] });
    expect(() => rimodulaRc(task)).toThrow(RuleError);
  });
});

describe('confirmAppt (appointment-level, Sicurezza)', () => {
  it('requires rdlc to be filled', () => {
    const task = makeTask({ stato: 'Da Confermare', appointments: [makeAppt({ id: 1, rdlc: '' })] });
    expect(() => confirmAppt(task, 1)).toThrow('Compila il campo RDLC prima di confermare/rimodulare.');
  });

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
});

describe('addAppointment', () => {
  it('requires all fields', () => {
    const task = makeTask({ stato: 'Non Gestito' });
    expect(() => addAppointment(task, '', '10/09/2026', '09:00')).toThrow(RuleError);
  });

  it('adds a Da Completare appointment when owner, without touching the RC-level stato', () => {
    const task = makeTask({ stato: 'Non Gestito' });
    const next = addAppointment(task, 'Cameretta B2', '10/09/2026', '09:00');
    expect(next.appointments).toHaveLength(1);
    expect(next.appointments[0].stato).toBe('Da Completare');
    expect(next.stato).toBe('Non Gestito');
  });
});

describe('full round trip: Realizzazione appuntamenta -> Sicurezza confirms appt -> both confirm RC', () => {
  it('drives the RC from Non Gestito to Appuntamentato', () => {
    let task = makeTask({
      stato: 'Non Gestito',
      appointments: [makeAppt({ id: 1, stato: 'Da Completare', rdlc: 'Mario Rossi' })],
    });

    task = appuntamenta(task);
    expect(task.stato).toBe('Da Confermare');
    expect(task.appointments[0].stato).toBe('Da Confermare');

    // Confirming the row does NOT close the RC by itself — only the explicit
    // top-box "Conferma" button (confirmRc) changes the RC-level stato.
    task = confirmAppt(task, 1);
    expect(task.appointments[0].stato).toBe('Confermato');
    expect(task.stato).toBe('Da Confermare');

    task = confirmRc(task);
    expect(task.stato).toBe('Appuntamentato');
  });
});

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

  it('rejects assigning an operatore when no RDLC is set yet', () => {
    const task = makeTask({ appointments: [makeAppt({ rdlc: '', operatore: '' })] });
    expect(() => reassignRemoteOperator(task, 1, 'Elena Rossi')).toThrow(RuleError);
  });
});

describe('deleteAppointment cannot leave a sent RC empty', () => {
  it('rejects deleting the last appointment once the RC is Da Rimodulare', () => {
    const task = makeTask({ stato: 'Da Rimodulare', appointments: [makeAppt({ id: 1 })] });
    expect(() => deleteAppointment(task, 1)).toThrow('Non puoi eliminare l’ultimo appuntamento di un RC già inviato.');
  });

  it('allows deleting the last appointment while the RC is still Non Gestito/Da Completare', () => {
    const task = makeTask({ stato: 'Da Completare', appointments: [makeAppt({ id: 1 })] });
    const next = deleteAppointment(task, 1);
    expect(next.appointments).toHaveLength(0);
  });
});

describe('bulk row actions are atomic (all-or-nothing RDLC validation)', () => {
  it('confirmApptsBulk rejects the whole batch if any selected row lacks rdlc, leaving none confirmed', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [
        makeAppt({ id: 1, rdlc: 'Mario Rossi' }),
        makeAppt({ id: 2, rdlc: '' }),
      ],
    });
    expect(() => confirmApptsBulk(task, [1, 2])).toThrow('Compila il campo RDLC prima di confermare/rimodulare.');
  });

  it('confirmApptsBulk confirms every selected row when all have rdlc', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [
        makeAppt({ id: 1, rdlc: 'Mario Rossi' }),
        makeAppt({ id: 2, rdlc: 'Giulia Marino' }),
      ],
    });
    const next = confirmApptsBulk(task, [1, 2]);
    expect(next.appointments[0].stato).toBe('Confermato');
    expect(next.appointments[1].stato).toBe('Confermato');
  });

  it('rimodulaApptsBulk rejects the whole batch if any selected row lacks rdlc', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi' }), makeAppt({ id: 2, rdlc: '' })],
    });
    expect(() => rimodulaApptsBulk(task, [1, 2], '15/09/2026', '10:00')).toThrow(RuleError);
  });

  it('realizzazioneRimodulaApptsBulk applies the same new date/slot to every selected row', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [makeAppt({ id: 1, stato: 'Da Rimodulare' }), makeAppt({ id: 2, stato: 'Da Rimodulare' })],
    });
    const next = realizzazioneRimodulaApptsBulk(task, [1, 2], '20/09/2026', '15:00');
    expect(next.appointments[0].dataPianificazione).toBe('20/09/2026');
    expect(next.appointments[1].dataPianificazione).toBe('20/09/2026');
    expect(next.appointments[0].stato).toBe('Da Confermare');
    expect(next.appointments[1].stato).toBe('Da Confermare');
  });
});

describe('assignRdlc resets operatore', () => {
  it('clears a stale operatore when RDLC is (re)assigned via the drawer', () => {
    const task = makeTask({
      appointments: [
        makeAppt({ id: 1, dataPianificazione: '10/01/2026', rdlc: 'Mario Rossi', operatore: 'Elena Rossi' }),
      ],
    });
    const next = assignRdlc(task, [1], 'Giulia Marino', '10/01/2026', '09:00');
    expect(next.appointments[0].rdlc).toBe('Giulia Marino');
    expect(next.appointments[0].operatore).toBe('');
  });
});

describe('realizzazioneRimodulaAppt never touches operatore', () => {
  it('leaves operatore (and therefore modalità) untouched on counter-proposal — Realizzazione only re-sends the appointment', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [makeAppt({ rdlc: 'Mario Rossi', operatore: 'Elena Rossi', stato: 'Da Rimodulare' })],
    });
    const next = realizzazioneRimodulaAppt(task, 1, '15/09/2026', '10:00');
    expect(next.appointments[0].operatore).toBe('Elena Rossi');
    expect(next.appointments[0].stato).toBe('Da Confermare');
  });

  it('leaves operatore empty when it was already empty', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [makeAppt({ rdlc: 'Mario Rossi', operatore: '', stato: 'Da Rimodulare' })],
    });
    const next = realizzazioneRimodulaAppt(task, 1, '15/09/2026', '10:00');
    expect(next.appointments[0].operatore).toBe('');
  });
});

describe('RC-level stato only ever changes via the explicit top-box actions', () => {
  it('realizzazioneRimodulaAppt (row-level) leaves the RC stato untouched', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi', stato: 'Da Rimodulare' })],
    });
    const next = realizzazioneRimodulaAppt(task, 1, '15/09/2026', '10:00');
    expect(next.stato).toBe('Da Rimodulare');
    expect(next.appointments[0].stato).toBe('Da Confermare');
  });

  it('realizzazioneRimodulaApptsBulk (row-level) leaves the RC stato untouched', () => {
    const task = makeTask({
      stato: 'Da Rimodulare',
      appointments: [
        makeAppt({ id: 1, rdlc: 'Mario Rossi', stato: 'Da Rimodulare' }),
        makeAppt({ id: 2, rdlc: 'Giulia Marino', stato: 'Da Rimodulare' }),
      ],
    });
    const next = realizzazioneRimodulaApptsBulk(task, [1, 2], '20/09/2026', '15:00');
    expect(next.stato).toBe('Da Rimodulare');
    expect(next.appointments[0].stato).toBe('Da Confermare');
    expect(next.appointments[1].stato).toBe('Da Confermare');
  });

  it('addAppointment leaves the RC stato untouched', () => {
    const task = makeTask({
      stato: 'Appuntamentato',
      appointments: [makeAppt({ id: 1, stato: 'Confermato' })],
    });
    const next = addAppointment(task, 'Cameretta Z9', '01/10/2026', '09:00');
    expect(next.stato).toBe('Appuntamentato');
    expect(next.appointments).toHaveLength(2);
  });

  it('deleteAppointment leaves the RC stato untouched', () => {
    const task = makeTask({
      stato: 'Appuntamentato',
      appointments: [makeAppt({ id: 1, stato: 'Confermato' }), makeAppt({ id: 2, stato: 'Confermato' })],
    });
    const next = deleteAppointment(task, 1);
    expect(next.stato).toBe('Appuntamentato');
    expect(next.appointments).toHaveLength(1);
  });

  it('confirmAppt (row-level) leaves the RC stato untouched even when it confirms the last row', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi', stato: 'Da Confermare' })],
    });
    const next = confirmAppt(task, 1);
    expect(next.appointments[0].stato).toBe('Confermato');
    expect(next.stato).toBe('Da Confermare');
  });

  it('assignRdlc leaves the appointment stato untouched', () => {
    const task = makeTask({
      appointments: [makeAppt({ id: 1, dataPianificazione: '10/01/2026', stato: 'Da Confermare' })],
    });
    const next = assignRdlc(task, [1], 'Giulia Marino', '10/01/2026', '09:00');
    expect(next.appointments[0].rdlc).toBe('Giulia Marino');
    expect(next.appointments[0].stato).toBe('Da Confermare');
  });
});
