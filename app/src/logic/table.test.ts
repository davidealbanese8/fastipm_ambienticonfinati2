import { describe, expect, it } from 'vitest';
import { filterByColumns, filterRows, paginate, sortRows, totalPages } from './table';

interface Row {
  name: string;
  lastUpdate: string;
  count: number;
}

const rows: Row[] = [
  { name: 'Alpha', lastUpdate: '05/01/2026 09:00', count: 3 },
  { name: 'Beta', lastUpdate: '20/12/2025 18:30', count: 1 },
  { name: 'Gamma', lastUpdate: '01/02/2026 08:00', count: 2 },
];

describe('filterRows', () => {
  it('filters case-insensitively across given fields', () => {
    expect(filterRows(rows, 'alp', ['name'])).toHaveLength(1);
    expect(filterRows(rows, '', ['name'])).toHaveLength(3);
  });
});

describe('filterByColumns', () => {
  it('filters exact-match per column', () => {
    expect(filterByColumns(rows, { name: 'Beta' })).toHaveLength(1);
    expect(filterByColumns(rows, {})).toHaveLength(3);
  });
});

describe('sortRows date-like chronological sort (bug fix vs. prototype lexicographic sort)', () => {
  it('sorts lastUpdate chronologically, not lexicographically', () => {
    const sorted = sortRows(rows, { column: 'lastUpdate', dir: 'asc' });
    // Chronological order: 20/12/2025, 05/01/2026, 01/02/2026
    expect(sorted.map((r) => r.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('naive string sort would have gotten this wrong', () => {
    const naive = [...rows].sort((a, b) => a.lastUpdate.localeCompare(b.lastUpdate));
    // proves the fixture actually exercises the bug: naive order differs from chronological order
    expect(naive.map((r) => r.name)).not.toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('sorts numeric columns numerically', () => {
    const sorted = sortRows(rows, { column: 'count', dir: 'desc' });
    expect(sorted.map((r) => r.count)).toEqual([3, 2, 1]);
  });
});

describe('paginate / totalPages', () => {
  it('paginates correctly', () => {
    expect(paginate(rows, 1, 2)).toHaveLength(2);
    expect(paginate(rows, 2, 2)).toHaveLength(1);
    expect(totalPages(rows.length, 2)).toBe(2);
  });
});
