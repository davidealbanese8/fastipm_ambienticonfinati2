/** Parse 'DD/MM/YYYY' or 'DD/MM/YYYY HH:mm' into a comparable timestamp (ms). Returns NaN on invalid input. */
export function parseDateLike(value: string): number {
  if (!value) return NaN;
  const [datePart, timePart] = value.split(' ');
  const dateBits = datePart?.split('/');
  if (!dateBits || dateBits.length !== 3) return NaN;
  const [dd, mm, yyyy] = dateBits.map((s) => parseInt(s, 10));
  if (!dd || !mm || !yyyy) return NaN;
  let hh = 0;
  let min = 0;
  if (timePart) {
    const [h, m] = timePart.split(':').map((s) => parseInt(s, 10));
    hh = h || 0;
    min = m || 0;
  }
  return new Date(yyyy, mm - 1, dd, hh, min).getTime();
}

export function formatNow(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function formatNowNoteTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} - ${hh}:${min}`;
}

export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const WEEKDAYS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** e.g. "Oggi – Gio 23 lug" */
export function formatTodayLabel(d: Date = new Date()): string {
  return `Oggi – ${WEEKDAYS_IT[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]}`;
}

/** Known date-like columns that require chronological (not lexicographic) sorting. */
export const DATE_LIKE_COLUMNS = new Set(['lastUpdate', 'dataPianificazione', 'dataRdlc']);

export function isDateLikeColumn(column: string): boolean {
  return DATE_LIKE_COLUMNS.has(column);
}
