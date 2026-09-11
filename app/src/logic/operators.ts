import type { AreaFw, Operator, Task } from '../types';

export const AREAS: AreaFw[] = ['Nord Est', 'Nord Ovest', 'Centro', 'Sud'];

const NAMES: Record<AreaFw, string[]> = {
  'Nord Est': ['Marco Bianchi', 'Elena Rossi', 'Luca Ferrari', 'Sara Colombo', 'Davide Ricci'],
  'Nord Ovest': ['Giulia Marino', 'Paolo Greco', 'Chiara Bruno', 'Andrea Gallo', 'Francesca Conti'],
  Centro: ['Matteo De Luca', 'Alessia Costa', 'Simone Fontana', 'Valentina Mari', 'Roberto Rinaldi'],
  Sud: [
    'Antonio Esposito',
    'Maria Romano',
    'Giuseppe Russo',
    'Anna Barbato',
    'Vincenzo Caruso',
    'Teresa Longo',
    'Salvatore Amato',
    'Rosa Fiore',
    'Carmine Testa',
    'Angela Sorrentino',
  ],
};

export function buildOperators(): Operator[] {
  const ops: Operator[] = [];
  for (const area of AREAS) {
    for (const name of NAMES[area]) ops.push({ name, area });
  }
  return ops;
}

/** Counts how many appointments (across all tasks) reference this operator's name as rdlc. */
export function loadOf(operatorName: string, tasks: Task[]): number {
  let count = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.rdlc === operatorName) count += 1;
    }
  }
  return count;
}

/** Suggests the least-loaded operator in the given area (ties broken by name order). */
export function suggestLeastLoadedOperator(area: AreaFw, operators: Operator[], tasks: Task[]): Operator | undefined {
  const inArea = operators.filter((o) => o.area === area);
  if (inArea.length === 0) return undefined;
  return [...inArea].sort((a, b) => {
    const diff = loadOf(a.name, tasks) - loadOf(b.name, tasks);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  })[0];
}

/** Confirmed ("Confermato") vs. still-pending ("Da Confermare") appointment counts for one operator. */
export function apptCounts(operatorName: string, tasks: Task[]): { confermati: number; daConfermare: number } {
  let confermati = 0;
  let daConfermare = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.rdlc !== operatorName) continue;
      if (a.stato === 'Confermato') confermati += 1;
      else if (a.stato === 'Da Confermare') daConfermare += 1;
    }
  }
  return { confermati, daConfermare };
}

/** Operator select options labeled with each operator's confirmed / pending appointment counts. */
export function operatorOptionsWithCounts(
  ops: Operator[],
  tasks: Task[]
): { value: string; label: string; group?: string }[] {
  return ops.map((o) => {
    const { confermati, daConfermare } = apptCounts(o.name, tasks);
    return { value: o.name, label: `${o.name} · ${confermati} conf. · ${daConfermare} da conf.` };
  });
}
