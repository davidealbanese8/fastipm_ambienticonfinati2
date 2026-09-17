import { formatDate } from './dates';
import { AREAS, OPERATORE_NAMES, buildRdlcPool } from './operators';
import { ALL_SLOTS, MORNING_SLOTS } from './timeSlots';
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

function buildAppointments(seed: number, rcStatus: RcStatus, areaFw: AreaFw): Appointment[] {
  // "Non Gestito" is the only status with an empty grid — every other status
  // requires at least one appointment (an RC cannot be e.g. "Da Rimodulare"
  // with zero rows to rimodulare). Operators' calendars should look busy in the
  // prototype, so each RC carries several rows rather than just one or two.
  const count = rcStatus === 'Non Gestito' ? 0 : 3 + (seed % 4); // 3..6 appointments
  const appointments: Appointment[] = [];
  const today = new Date();
  // A "clustered" RC pins all of its rows to one RDLC, one day and one stretch of the
  // morning, so that a single person really does hold several appointments inside the same
  // hour. Without it the seed produced exactly one appointment per person-day-hour and the
  // 15-minute granularity the calendar exists to show had nothing to show.
  // Every third RC clusters; half of those step by 30 minutes (two separate bookings in one
  // hour) and half by 15 (a continuous run that renders as one merged block).
  const clustered = seed % 3 === 0;
  const clusterStep = seed % 2 === 0 ? 2 : 1;
  const clusterStart = seed % 8;
  const clusterDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((seed % 11) - 3));
  const clusterRdlcSeed = seed;

  for (let i = 0; i < count; i++) {
    const s = seed + i * 17;
    // Cluster dates within ±14 days of today (not spread across the whole year) so a
    // single week's view — the calendar globale, the RDLC drawer, "oggi" — actually
    // looks busy instead of mostly "Libero".
    const offsetDays = (s % 29) - 14;
    const date = clustered
      ? clusterDate
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
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
    const isLockedIn = stato === 'Confermato' || stato === 'Da Rimodulare';
    // RDLC is mandatory once Sicurezza has acted on a row (Confermato/Da Rimodulare — the
    // real rules never allow either without one); otherwise it's still random/undecided,
    // so most-but-not-all rows get one for a densely booked operator calendar.
    const hasRdlc = isLockedIn || s % 10 !== 0;
    // RDLC is area-bound: only someone from the RC's own area may be seeded here, or the
    // per-row RDLC menu (which lists that area only) would render the value as blank.
    const rdlcPool = buildRdlcPool().filter((o) => o.area === areaFw);
    // Clustered rows share one RDLC: keyed on `seed`, constant across the RC's rows, rather
    // than on `s`, which varies per row and would scatter them over different people.
    const rdlc = hasRdlc ? pick(rdlcPool, clustered ? clusterRdlcSeed : s).name : '';
    // Clustered rows walk the morning strip from a common start, so they land in the same
    // hour at different quarters (09:00 / 09:30 …) instead of on unrelated days.
    const slot = clustered ? MORNING_SLOTS[(clusterStart + i * clusterStep) % MORNING_SLOTS.length] : pick(ALL_SLOTS, s);
    // Remote only possible once an RDLC is assigned; roughly 1 in 3 locked-in appointments
    // go remote. Drawn from OPERATORE_NAMES — the remote-assist pool — never from the RDLC
    // roster: they are different people filling a different field.
    const operatore = hasRdlc && isLockedIn && s % 3 === 0 ? pick(OPERATORE_NAMES, s + 5) : '';
    appointments.push({
      id: i + 1,
      cameretta: `Cameretta ${String.fromCharCode(65 + (s % 6))}${1 + (s % 4)}`,
      dataPianificazione: formatDate(date),
      slot,
      stato,
      rdlc,
      dataRdlc: isLockedIn ? formatDate(date) : '',
      // A clustered row keeps its clustered slot: re-picking here would scatter the very
      // cluster this RC exists to create (the calendar reads slotRdlc when it is set).
      slotRdlc: isLockedIn ? (clustered ? slot : pick(ALL_SLOTS, s + 1)) : '',
      operatore,
    });
  }
  // An RC "Da Confermare" or "Da Rimodulare" with every row already "Confermato" would
  // have already auto-closed to "Appuntamentato" in the real app (see rules.ts
  // stampUpdate) — keep at least one row still open so the RC-level status stays valid.
  if (
    (rcStatus === 'Da Confermare' || rcStatus === 'Da Rimodulare') &&
    appointments.length > 0 &&
    appointments.every((a) => a.stato === 'Confermato')
  ) {
    const last = appointments[appointments.length - 1];
    if (rcStatus === 'Da Confermare') {
      // Not yet answered by Realizzazione: Sicurezza hasn't proposed a date/slot for this row.
      last.stato = 'Da Confermare';
      last.dataRdlc = '';
      last.slotRdlc = '';
    } else {
      // Da Rimodulare: the row was already "Confermato" (so already carries a valid
      // rdlc/dataRdlc/slotRdlc from Sicurezza) — keep them, only flip it back open.
      last.stato = 'Da Rimodulare';
    }
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
    const appointments = buildAppointments(seed, stato, areaFw);
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
