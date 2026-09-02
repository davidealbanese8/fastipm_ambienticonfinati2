import { describe, expect, it } from 'vitest';
import { buildOperators, loadOf, suggestLeastLoadedOperator } from './operators';
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
      { id: 1, cameretta: '', dataPianificazione: '', fasciaOraria: '09:00 - 13:00', stato: 'Da Confermare', rdlc, dataRdlc: '', fasciaOrariaRdlc: '' },
    ],
    notes: [],
    pendingSicurezzaNote: false,
  };
}

describe('buildOperators', () => {
  it('produces 25 operators across the 4 areas with the 5/5/5/10 split', () => {
    const ops = buildOperators();
    expect(ops).toHaveLength(25);
    expect(ops.filter((o) => o.area === 'Nord Est')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Nord Ovest')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Centro')).toHaveLength(5);
    expect(ops.filter((o) => o.area === 'Sud')).toHaveLength(10);
  });
});

describe('suggestLeastLoadedOperator', () => {
  it('suggests the operator with the fewest assigned appointments in the given area', () => {
    const ops = buildOperators();
    const centroOps = ops.filter((o) => o.area === 'Centro');
    const loaded = centroOps[0].name;
    const tasks = [taskWithRdlc('RC1', loaded), taskWithRdlc('RC2', loaded)];
    const suggestion = suggestLeastLoadedOperator('Centro', ops, tasks);
    expect(suggestion).toBeDefined();
    expect(suggestion!.name).not.toBe(loaded);
    expect(loadOf(suggestion!.name, tasks)).toBe(0);
  });
});
