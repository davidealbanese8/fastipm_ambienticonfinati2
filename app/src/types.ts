export type RcStatus =
  | 'Non Gestito'
  | 'Da Completare'
  | 'Da Confermare'
  | 'Confermato'
  | 'Nuovo'
  | 'Da Rimodulare'
  | 'Appuntamentato';

export type AppointmentStatus = 'Nuovo' | 'Da Confermare' | 'Da Rimodulare' | 'Confermato';

export type AreaFw = 'Nord Est' | 'Nord Ovest' | 'Centro' | 'Sud';

export type FasciaOraria = '09:00 - 13:00' | '14:00 - 18:00';

export type Role = 'realizzazione' | 'sicurezza';

export interface Appointment {
  id: number;
  cameretta: string;
  dataPianificazione: string; // DD/MM/YYYY
  fasciaOraria: FasciaOraria;
  stato: AppointmentStatus;
  rdlc: string;
  dataRdlc: string; // '' or DD/MM/YYYY
  fasciaOrariaRdlc: FasciaOraria | '';
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
