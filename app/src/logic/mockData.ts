import { formatDate } from './dates';
import { AREAS, buildOperators } from './operators';
import { ALL_SLOTS } from './timeSlots';
import type { Appointment, AppointmentStatus, AreaFw, Note, RcStatus, Task } from '../types';

// Deterministic string hash for reproducible-but-varied seeding.
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const CITIES = [
  'Salerno',
  'Cava de’ Tirreni',
  'Battipaglia',
  'Nocera Inferiore',
  'Angri',
  'Scafati',
  'Eboli',
  'Sarno',
  'Pagani',
  'Mercato San Severino',
];

const CLIENTS = [
  'Acciaierie del Sud SpA',
  'Porto Industriale Srl',
  'Chimica Meridionale',
  'Cantieri Navali Tirreno',
  'Raffineria Campana',
  'Depuratore Consortile',
  'Impianti Termici Salerno',
  'Gasdotti Sud Srl',
  'Petrolchimico Irno',
  'Energia Verde Campania',
];

// Exactly the 5 valid RC-level states — "Confermato" is never an RC status.
const RC_STATUSES: RcStatus[] = ['Non Gestito', 'Da Completare', 'Da Confermare', 'Da Rimodulare', 'Appuntamentato'];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function buildAppointments(seed: number, rcStatus: RcStatus): Appointment[] {
  // "Non Gestito" is the only status with an empty grid — every other status
  // requires at least one appointment (an RC cannot be e.g. "Da Rimodulare"
  // with zero rows to rimodulare).
  const count = rcStatus === 'Non Gestito' ? 0 : 1 + (seed % 3); // 1..3 appointments
  const appointments: Appointment[] = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i * 17;
    const day = 1 + (s % 27);
    const month = 1 + ((s >> 3) % 12);
    const date = new Date(2026, month - 1, day);
    // Keep appointment states consistent with RC-level status — in particular, a row
    // can only be "Da Confermare" while the RC itself is "Da Confermare" too (an RC can
    // never contain a "Da Confermare" row while being e.g. "Da Rimodulare").
    let stato: AppointmentStatus;
    if (rcStatus === 'Non Gestito' || rcStatus === 'Da Completare') {
      stato = 'Da Completare';
    } else if (rcStatus === 'Appuntamentato') {
      stato = 'Confermato';
    } else if (rcStatus === 'Da Confermare') {
      stato = pick<AppointmentStatus>(['Da Confermare', 'Da Rimodulare', 'Confermato'], s);
    } else {
      // Da Rimodulare: rows are either already answered (Confermato) or still
      // awaiting Realizzazione's response to Sicurezza's proposal (Da Rimodulare).
      stato = pick<AppointmentStatus>(['Da Rimodulare', 'Confermato'], s);
    }
    const hasRdlc = s % 3 !== 0;
    const rdlc = hasRdlc ? pick(buildOperators(), s).name : '';
    const isLockedIn = stato === 'Confermato' || stato === 'Da Rimodulare';
    // Remote only possible once an RDLC is assigned; roughly 1 in 3 locked-in appointments go remote.
    const operatore = hasRdlc && isLockedIn && s % 3 === 0 ? pick(buildOperators(), s + 5).name : '';
    appointments.push({
      id: i + 1,
      cameretta: `Cameretta ${String.fromCharCode(65 + (s % 6))}${1 + (s % 4)}`,
      dataPianificazione: formatDate(date),
      slot: pick(ALL_SLOTS, s),
      stato,
      rdlc,
      dataRdlc: isLockedIn ? formatDate(date) : '',
      slotRdlc: isLockedIn ? pick(ALL_SLOTS, s + 1) : '',
      operatore,
    });
  }
  return appointments;
}

function buildNotes(seed: number, protocollo: string): Note[] {
  if (seed % 5 !== 0) return [];
  return [
    {
      author: 'System Sicurezza',
      text: `Nota automatica di sistema per ${protocollo}.`,
      timestamp: '01/09/2026 - 09:30',
    },
  ];
}

export function generateMockTasks(count = 45): Task[] {
  const tasks: Task[] = [];
  for (let i = 1; i <= count; i++) {
    const protocollo = `RC${String(100000 + i * 37).slice(0, 7)}`;
    const seed = hash(protocollo) + i;
    const stato = pick(RC_STATUSES, seed);
    const areaFw: AreaFw = pick(AREAS, seed + 3);
    const appointments = buildAppointments(seed, stato);
    const day = 1 + (seed % 27);
    const month = 1 + ((seed >> 4) % 12);
    const lastUpdateDate = new Date(2026, month - 1, day, seed % 24, (seed * 7) % 60);
    const lastUpdate = `${formatDate(lastUpdateDate)} ${String(lastUpdateDate.getHours()).padStart(2, '0')}:${String(
      lastUpdateDate.getMinutes()
    ).padStart(2, '0')}`;
    tasks.push({
      protocollo,
      stato,
      lastUpdate,
      systemRealizzazione: `SYS-R-${1000 + (seed % 900)}`,
      systemSicurezza: `SYS-S-${2000 + (seed % 900)}`,
      cliente: pick(CLIENTS, seed + 1),
      citta: pick(CITIES, seed + 2),
      provincia: 'Salerno',
      regione: 'Campania',
      areaFw,
      appointments,
      notes: buildNotes(seed, protocollo),
      pendingSicurezzaNote: seed % 7 === 0,
    });
  }
  return tasks;
}
