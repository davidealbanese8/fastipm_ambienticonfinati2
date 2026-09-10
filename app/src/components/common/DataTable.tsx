import { useMemo, useState } from 'react';
import {
  ArrowsDownUp,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { paginate, sortRows, totalPages, type SortSpec } from '../../logic/table';
import { Combobox, type ComboboxOption } from './Combobox';
import styles from './DataTable.module.css';

export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T extends { protocollo?: string }>({
  rows,
  columns,
  pageSize = 8,
  rowKey,
  onRowClick,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<SortSpec<T> | null>(null);
  const [page, setPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<string, string>>>({});

  const filtered = useMemo(() => {
    const entries = Object.entries(columnFilters).filter(([, v]) => v);
    if (entries.length === 0) return rows;
    return rows.filter((row) =>
      entries.every(([col, val]) =>
        String((row as Record<string, unknown>)[col] ?? '')
          .toLowerCase()
          .includes(String(val).toLowerCase())
      )
    );
  }, [rows, columnFilters]);

  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const pages = totalPages(sorted.length, pageSize);
  const clampedPage = Math.min(page, pages);
  const pageRows = useMemo(() => paginate(sorted, clampedPage, pageSize), [sorted, clampedPage, pageSize]);
  const rangeStart = sorted.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(clampedPage * pageSize, sorted.length);
  const pageNumbers = useMemo(() => Array.from({ length: pages }, (_, i) => i + 1), [pages]);

  function toggleSort(col: keyof T & string) {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.column !== col) return { column: col, dir: 'asc' };
      if (prev.dir === 'asc') return { column: col, dir: 'desc' };
      return null;
    });
  }

  function setColumnFilter(col: string, value: string) {
    setPage(1);
    setColumnFilters((prev) => ({ ...prev, [col]: value }));
  }

  function columnSuggestions(col: ColumnDef<T>): ComboboxOption[] {
    const q = (columnFilters[col.key] ?? '').trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: ComboboxOption[] = [];
    for (const row of rows) {
      const raw = String((row as Record<string, unknown>)[col.key] ?? '');
      if (!raw || seen.has(raw) || !raw.toLowerCase().includes(q)) continue;
      seen.add(raw);
      out.push({ value: raw, label: raw });
      if (out.length >= 8) break;
    }
    return out;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }} onClick={() => toggleSort(col.key)} className={styles.th}>
                  <span className={styles.thContent}>
                    {col.header}
                    <ArrowsDownUp size={12} weight={sort?.column === col.key ? 'bold' : 'regular'} />
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={styles.filterTh}>
                  <span className={styles.filterInput}>
                    <MagnifyingGlass size={12} />
                    <Combobox
                      options={columnSuggestions(col)}
                      value={columnFilters[col.key] ?? ''}
                      onChange={(v) => setColumnFilter(col.key, v)}
                      freeSolo
                      aria-label={`Filtra ${col.header}`}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  Nessun risultato.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? styles.clickable : undefined}>
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <span className={styles.pageInfo}>
          {rangeStart}–{rangeEnd} di {sorted.length}
        </span>
        <div className={styles.pageControls}>
          <button disabled={clampedPage <= 1} onClick={() => setPage(1)} aria-label="Prima pagina">
            <CaretDoubleLeft size={14} />
          </button>
          <button disabled={clampedPage <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Pagina precedente">
            <CaretLeft size={14} />
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              className={n === clampedPage ? styles.pageNumActive : styles.pageNum}
              onClick={() => setPage(n)}
              aria-label={`Pagina ${n}`}
              aria-current={n === clampedPage}
            >
              {n}
            </button>
          ))}
          <button disabled={clampedPage >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Pagina successiva">
            <CaretRight size={14} />
          </button>
          <button disabled={clampedPage >= pages} onClick={() => setPage(pages)} aria-label="Ultima pagina">
            <CaretDoubleRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
