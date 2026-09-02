import { describe, expect, it } from 'vitest';
import {
  RuleError,
  addAppointment,
  appuntamenta,
  confirmAppt,
  confirmRc,
  confirmRealizzazione,
  isRealizzazioneOwner,
  isSicurezzaOwner,
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
    fasciaOraria: '09:00 - 13:00',
    stato: 'Nuovo',
    rdlc: '',
    dataRdlc: '',
    fasciaOrariaRdlc: '',
    ...overrides,
  };
}

describe('ownership', () => {
  it('realizzazione owns everything except Da Confermare / Appuntamentato', () => {
    expect(isRealizzazioneOwner(makeTask({ stato: 'Non Gestito' }))).toBe(true);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Da Rimodulare' }))).toBe(true);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Da Confermare' }))).toBe(false);
    expect(isRealizzazioneOwner(makeTask({ stato: 'Appuntamentato' }))).toBe(false);
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

  it('moves Nuovo appointments to Da Confermare and RC to Da Confermare, stamping lastUpdate', () => {
    const task = makeTask({ stato: 'Non Gestito', appointments: [makeAppt({ stato: 'Nuovo' })], lastUpdate: 'stale' });
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
    const task = makeTask({ stato: 'Da Confermare', appointments: [makeAppt({ stato: 'Confermato' })] });
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

  it('locks dataRdlc/fasciaOrariaRdlc to planned values on confirm', () => {
    const task = makeTask({
      stato: 'Da Confermare',
      appointments: [makeAppt({ id: 1, rdlc: 'Mario Rossi', dataPianificazione: '12/09/2026', fasciaOraria: '14:00 - 18:00' })],
    });
    const next = confirmAppt(task, 1);
    expect(next.appointments[0].stato).toBe('Confermato');
    expect(next.appointments[0].dataRdlc).toBe('12/09/2026');
    expect(next.appointments[0].fasciaOrariaRdlc).toBe('14:00 - 18:00');
  });
});

describe('addAppointment', () => {
  it('requires all fields', () => {
    const task = makeTask({ stato: 'Non Gestito' });
    expect(() => addAppointment(task, '', '10/09/2026', '09:00 - 13:00')).toThrow(RuleError);
  });

  it('adds a Nuovo appointment when owner', () => {
    const task = makeTask({ stato: 'Non Gestito' });
    const next = addAppointment(task, 'Cameretta B2', '10/09/2026', '09:00 - 13:00');
    expect(next.appointments).toHaveLength(1);
    expect(next.appointments[0].stato).toBe('Nuovo');
  });
});

describe('full round trip: Realizzazione appuntamenta -> Sicurezza confirms appt -> both confirm RC', () => {
  it('drives the RC from Non Gestito to Appuntamentato', () => {
    let task = makeTask({
      stato: 'Non Gestito',
      appointments: [makeAppt({ id: 1, stato: 'Nuovo', rdlc: 'Mario Rossi' })],
    });

    task = appuntamenta(task);
    expect(task.stato).toBe('Da Confermare');
    expect(task.appointments[0].stato).toBe('Da Confermare');

    task = confirmAppt(task, 1);
    expect(task.appointments[0].stato).toBe('Confermato');

    task = confirmRc(task);
    expect(task.stato).toBe('Appuntamentato');
  });
});
