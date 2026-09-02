import type { AppointmentStatus, RcStatus } from './types';

export const colors = {
  pageBg: '#F4F5F7',
  cardBg: '#FFFFFF',
  dark: '#1d2027',
  brandOrange: '#FFB430',
  headerGradient: 'linear-gradient(90deg, #FFB430, #F06292, #BA68C8, #7986CB, #4FC3F7)',
  textSecondary1: '#6b7280',
  textSecondary2: '#374151',
  textSecondary3: '#9ca3af',
  textSecondary4: '#4b5563',
  border1: '#e5e7eb',
  border2: '#f0f1f3',
  border3: '#d1d5db',

  success: { bg: '#EAFBEF', border: '#CDEBD6', text: '#15803D' },
  rimodula: { bg: '#F4EEFE', border: '#E3D6FA', text: '#6D28D9' },
  danger: { bg: '#FDECEC', border: '#FBD5D5', text: '#C0392B' },
  deleteConfirm: '#dc2626',
  rdlc: { bg: '#EEF2FF', border: '#C7D2FE', text: '#4657C4' },
  amber: { bg: '#FFF4E0', border: '#FFE0A3', text: '#B8720B' },
  quickCalendario: { bg: '#EEF1FC', border: '#e3e7f7' },
  quickRiassegna: { bg: '#F4EEFE', border: '#E3D6FA' },
  detailHeader: { bg: '#FDF1DD', border: '#FBE2BB' },
  notesOdd: { bg: '#FBF7E9', border: '#F1E4B8' },
  notesEven: { bg: '#EEF2FA', border: '#DCE3FB' },
  toastBg: '#1d2027',
  modalScrim: 'rgba(17,20,26,0.45)',
  drawerScrim: 'rgba(17,20,26,0.35)',
  protocolloLink: '#5B6BF5',
};

export const statusColors: Record<RcStatus, { bg: string; text: string }> = {
  'Non Gestito': { bg: '#E5E7EB', text: '#4B5563' },
  'Da Completare': { bg: '#FDECC8', text: '#9A6400' },
  'Da Confermare': { bg: '#F8D7E8', text: '#B23A72' },
  Confermato: { bg: '#DCE3FB', text: '#4657C4' },
  Nuovo: { bg: '#EEF0F2', text: '#4b5563' },
  'Da Rimodulare': { bg: '#EAE0FB', text: '#6D28D9' },
  Appuntamentato: { bg: '#15803D', text: '#FFFFFF' },
};

/**
 * At the appointment level, status "Confermato" is displayed with the label
 * "Appuntamentato" (label remap only — color stays that of "Confermato").
 */
export function displayLabel(status: RcStatus | AppointmentStatus, level: 'rc' | 'appointment'): string {
  if (level === 'appointment' && status === 'Confermato') return 'Appuntamentato';
  return status;
}

export function getStatusColor(status: RcStatus | AppointmentStatus) {
  return statusColors[status as RcStatus] ?? { bg: '#EEF0F2', text: '#4b5563' };
}

export const spacing = {
  cardRadius: '14px',
  controlRadius: '10px',
  smallRadius: '8px',
  pillRadius: '20px',
};

export const fontFamily = "'Sora', -apple-system, 'Segoe UI', Arial, sans-serif";
