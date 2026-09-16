import { describe, expect, it } from 'vitest';
import { OPERATORE_NAMES, buildRdlcPool, loadOf, suggestLeastLoadedRdlc } from './operators';
import type { Task } from '../types';

function taskWithRdlc(protocollo: string, rdlc: string): Task {
  return {
    protocollo,
    stato: 'Da Confermare',
    lastUpdate: '01/01/2026 10:00',
    systemRealizzazione: '',
    systemSicurezza: '',
    cliente: '',
    citta: '',
    provincia: 'Salerno',
    regione: 'Campania',
    areaFw: 'Centro',
    appointments: [
      { id: 1, cameretta: '', dataPianificazione: '', slot: '09:00', stato: 'Da Confermare', rdlc, dataRdlc: '', slotRdlc: '', operatore: '' },
    ],
    notes: [],
    pendingSicurezzaNote: false,
  };
}

describe('buildRdlcPool', () => {
  it('produces 20 RDLC operators, exactly 5 per area', () => {
    const ops = buildRdlcPool();
    expect(ops).toHaveLength(20);
    expect(ops.filter((o) => o.area === 'Nord Est')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Nord Ovest')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Centro')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Sud')).toHaveLength(5);
  });
});

describe('OPERATORE_NAMES', () => {
  it('is a fixed, area-independent pool of at most 5 names', () => {
    expect(OPERATORE_NAMES).toHaveLength(5);
    expect(new Set(OPERATORE_NAMES).size).toBe(5);
  });
});

describe('suggestLeastLoadedRdlc', () => {
  it('suggests the operator with the fewest assigned appointments in the given area', () => {
    const ops = buildRdlcPool();
    const centroOps = ops.filter((o) => o.area === 'Centro');
    const loaded = centroOps[0].name;
    const tasks = [taskWithRdlc('RC1', loaded), taskWithRdlc('RC2', loaded)];
    const suggestion = suggestLeastLoadedRdlc('Centro', ops, tasks);
    expect(suggestion).toBeDefined();
    expect(suggestion!.name).not.toBe(loaded);
    expect(loadOf(suggestion!.name, tasks)).toBe(0);
  });
});
