// Exactly 5 valid RC-level states — "Confermato" is an appointment-row status only,
// never an RC one (the RC's "closed/confirmed" state is "Appuntamentato").
export type RcStatus = 'Non Gestito' | 'Da Completare' | 'Da Confermare' | 'Da Rimodulare' | 'Appuntamentato';

// A row starts life as 'Da Completare' (same concept as the RC-level 'Da Completare':
// saved but not yet sent to Sicurezza via "Appuntamenta"). There is no separate 'Nuovo'.
export type AppointmentStatus = 'Da Completare' | 'Da Confermare' | 'Da Rimodulare' | 'Confermato';

export type AreaFw = 'Nord Est' | 'Nord Ovest' | 'Centro' | 'Sud';

export type TimeSlot = string; // "HH:MM", inizio di un blocco da 15 minuti — vedi logic/timeSlots.ts

export type Role = 'realizzazione' | 'sicurezza';

export interface Appointment {
  id: number;
  cameretta: string;
  dataPianificazione: string; // DD/MM/YYYY
  slot: TimeSlot;
  stato: AppointmentStatus;
  rdlc: string;
  dataRdlc: string; // '' or DD/MM/YYYY
  slotRdlc: TimeSlot | '';
  operatore: string; // '' = in presenza; valorizzato = da remoto
}

export interface Note {
  author: 'System Sicurezza' | 'System Realizzazione';
  text: string;
  timestamp: string; // DD/MM/YYYY - HH:mm
  context?: string;
}

export interface Task {
  protocollo: string;
  stato: RcStatus;
  lastUpdate: string; // DD/MM/YYYY HH:mm
  systemRealizzazione: string;
  systemSicurezza: string;
  cliente: string;
  citta: string;
  provincia: string;
  regione: string;
  areaFw: AreaFw;
  appointments: Appointment[];
  notes: Note[];
  pendingSicurezzaNote: boolean;
}

export interface Operator {
  name: string;
  area: AreaFw;
}

export function taskIdFromProtocollo(protocollo: string): string {
  return 'TASK' + protocollo.replace('RC', '');
}
