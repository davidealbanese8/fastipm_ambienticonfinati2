import { isDateLikeColumn, parseDateLike } from './dates';

export type SortDir = 'asc' | 'desc';

export interface SortSpec<T> {
  column: keyof T & string;
  dir: SortDir;
}

/** Generic case-insensitive substring filter over a set of string-valued fields. */
export function filterRows<T>(rows: T[], searchText: string, fields: (keyof T)[]): T[] {
  const q = searchText.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q)));
}

/** Per-column exact/substring filters, e.g. { stato: 'Confermato' }. */
export function filterByColumns<T>(rows: T[], columnFilters: Partial<Record<keyof T & string, string>>): T[] {
  const entries = Object.entries(columnFilters).filter(([, v]) => v);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([col, val]) => String((row as Record<string, unknown>)[col] ?? '').toLowerCase() === String(val).toLowerCase())
  );
}

/**
 * Sorts rows by a column. Date-like columns are parsed chronologically (bug fix vs. the
 * prototype's naive localeCompare-on-stringified-values, which sorted lastUpdate lexicographically).
 */
export function sortRows<T>(rows: T[], sort: SortSpec<T> | null): T[] {
  if (!sort) return rows;
  const { column, dir } = sort;
  const mult = dir === 'asc' ? 1 : -1;
  const dateLike = isDateLikeColumn(column);
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[column];
    const bv = (b as Record<string, unknown>)[column];
    if (dateLike) {
      const ad = parseDateLike(String(av ?? ''));
      const bd = parseDateLike(String(bv ?? ''));
      if (Number.isNaN(ad) && Number.isNaN(bd)) return 0;
      if (Number.isNaN(ad)) return 1;
      if (Number.isNaN(bd)) return -1;
      return (ad - bd) * mult;
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
    return String(av ?? '').localeCompare(String(bv ?? '')) * mult;
  });
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function totalPages(rowCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}
