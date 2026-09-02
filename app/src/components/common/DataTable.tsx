import { useMemo, useState } from 'react';
import { ArrowsDownUp, CaretDoubleLeft, CaretDoubleRight, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { paginate, sortRows, totalPages, type SortSpec } from '../../logic/table';
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

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pages = totalPages(sorted.length, pageSize);
  const clampedPage = Math.min(page, pages);
  const pageRows = useMemo(() => paginate(sorted, clampedPage, pageSize), [sorted, clampedPage, pageSize]);

  function toggleSort(col: keyof T & string) {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.column !== col) return { column: col, dir: 'asc' };
      if (prev.dir === 'asc') return { column: col, dir: 'desc' };
      return null;
    });
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
        <button disabled={clampedPage <= 1} onClick={() => setPage(1)} aria-label="Prima pagina">
          <CaretDoubleLeft size={14} />
        </button>
        <button disabled={clampedPage <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Pagina precedente">
          <CaretLeft size={14} />
        </button>
        <span className={styles.pageInfo}>
          Pagina {clampedPage} di {pages}
        </span>
        <button disabled={clampedPage >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Pagina successiva">
          <CaretRight size={14} />
        </button>
        <button disabled={clampedPage >= pages} onClick={() => setPage(pages)} aria-label="Ultima pagina">
          <CaretDoubleRight size={14} />
        </button>
      </div>
    </div>
  );
}
