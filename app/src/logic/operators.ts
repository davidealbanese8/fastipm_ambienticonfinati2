import type { AreaFw, Operator, Task } from '../types';

export const AREAS: AreaFw[] = ['Nord Est', 'Nord Ovest', 'Centro', 'Sud'];

// RDLC pool: at most 5 names per area — the RDLC menu is always scoped to the RC's area.
const NAMES: Record<AreaFw, string[]> = {
  'Nord Est': ['Marco Bianchi', 'Elena Rossi', 'Luca Ferrari', 'Sara Colombo', 'Davide Ricci'],
  'Nord Ovest': ['Giulia Marino', 'Paolo Greco', 'Chiara Bruno', 'Andrea Gallo', 'Francesca Conti'],
  Centro: ['Matteo De Luca', 'Alessia Costa', 'Simone Fontana', 'Valentina Mari', 'Roberto Rinaldi'],
  Sud: ['Antonio Esposito', 'Maria Romano', 'Giuseppe Russo', 'Anna Barbato', 'Vincenzo Caruso'],
};

// Operatore pool (remote-assist role): a fixed, area-independent list of at most 5 names.
// Entirely separate people from the RDLC pool above — the two roles are never drawn from
// the same list, and a name in one never appears in the other.
export const OPERATORE_NAMES: string[] = ['Teresa Longo', 'Salvatore Amato', 'Rosa Fiore', 'Carmine Testa', 'Angela Sorrentino'];

/** Builds the RDLC pool: 5 names per area. Unrelated to the Operatore role — see OPERATORE_NAMES. */
export function buildRdlcPool(): Operator[] {
  const ops: Operator[] = [];
  for (const area of AREAS) {
    for (const name of NAMES[area]) ops.push({ name, area });
  }
  return ops;
}

/** Counts how many appointments (across all tasks) name this person as their RDLC. */
export function loadOf(rdlcName: string, tasks: Task[]): number {
  let count = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.rdlc === rdlcName) count += 1;
    }
  }
  return count;
}

/** Suggests the least-loaded RDLC in the given area (ties broken by name order). */
export function suggestLeastLoadedRdlc(area: AreaFw, operators: Operator[], tasks: Task[]): Operator | undefined {
  const inArea = operators.filter((o) => o.area === area);
  if (inArea.length === 0) return undefined;
  return [...inArea].sort((a, b) => {
    const diff = loadOf(a.name, tasks) - loadOf(b.name, tasks);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  })[0];
}

/** How many appointments (across all tasks) this RDLC already has at that exact slot. */
function loadAtSlot(rdlcName: string, slot: string, tasks: Task[]): number {
  let count = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.rdlc === rdlcName && a.slot === slot) count += 1;
    }
  }
  return count;
}

/** Suggests the RDLC (within the RC's area) with the fewest appointments at that exact hour/slot. */
export function suggestRdlcForSlot(
  area: AreaFw,
  slot: string,
  operators: Operator[],
  tasks: Task[]
): Operator | undefined {
  const inArea = operators.filter((o) => o.area === area);
  if (inArea.length === 0) return undefined;
  return [...inArea].sort((a, b) => {
    const diff = loadAtSlot(a.name, slot, tasks) - loadAtSlot(b.name, slot, tasks);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  })[0];
}

/** Confirmed ("Confermato") vs. still-pending ("Da Confermare") appointment counts for one RDLC. */
export function apptCountsAsRdlc(rdlcName: string, tasks: Task[]): { confermati: number; daConfermare: number } {
  let confermati = 0;
  let daConfermare = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.rdlc !== rdlcName) continue;
      if (a.stato === 'Confermato') confermati += 1;
      else if (a.stato === 'Da Confermare') daConfermare += 1;
    }
  }
  return { confermati, daConfermare };
}

/** Same counts, but for the Operatore (remote-assist) role instead of RDLC. */
export function apptCountsAsOperatore(operatoreName: string, tasks: Task[]): { confermati: number; daConfermare: number } {
  let confermati = 0;
  let daConfermare = 0;
  for (const t of tasks) {
    for (const a of t.appointments) {
      if (a.operatore !== operatoreName) continue;
      if (a.stato === 'Confermato') confermati += 1;
      else if (a.stato === 'Da Confermare') daConfermare += 1;
    }
  }
  return { confermati, daConfermare };
}

export interface CountedOption {
  value: string;
  label: string;
  group?: string;
  detail: string;
}

/** RDLC select options, labeled with each RDLC's confirmed / pending counts (counts a.rdlc). */
export function rdlcOptionsWithCounts(ops: Operator[], tasks: Task[]): CountedOption[] {
  return ops.map((o) => {
    const { confermati, daConfermare } = apptCountsAsRdlc(o.name, tasks);
    return { value: o.name, label: o.name, detail: `${confermati} conf. · ${daConfermare} da conf.` };
  });
}

/** Operatore select options (fixed 5-name pool), same counted-detail shape (counts a.operatore). */
export function operatoreOptionsWithCounts(tasks: Task[]): CountedOption[] {
  return OPERATORE_NAMES.map((name) => {
    const { confermati, daConfermare } = apptCountsAsOperatore(name, tasks);
    return { value: name, label: name, detail: `${confermati} conf. · ${daConfermare} da conf.` };
  });
}
