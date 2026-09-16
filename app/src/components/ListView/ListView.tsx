import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, ChatText, MagnifyingGlass, MapPin, X } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { DataTable, type ColumnDef, type DataTableHandle } from '../common/DataTable';
import { StatusPill } from '../common/StatusPill';
import { Combobox, type ComboboxOption } from '../common/Combobox';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { filterByColumns, filterRows } from '../../logic/table';
import { formatDate, formatTodayLabel, parseDateLike } from '../../logic/dates';
import type { RcStatus, Task } from '../../types';
import styles from './ListView.module.css';

const REALIZZAZIONE_FILTERS: (RcStatus | 'Tutti')[] = [
  'Tutti',
  'Non Gestito',
  'Da Completare',
  'Da Confermare',
  'Da Rimodulare',
  'Appuntamentato',
];

const SICUREZZA_FILTERS: (RcStatus | 'Tutti')[] = ['Tutti', 'Da Confermare', 'Da Rimodulare', 'Appuntamentato'];
const SICUREZZA_ALLOWED: RcStatus[] = ['Da Confermare', 'Da Rimodulare', 'Appuntamentato'];

export function ListView() {
  const { role, tasks } = useAppState();
  const dispatch = useAppDispatch();
  const [activeFilter, setActiveFilter] = useState<RcStatus | 'Tutti'>(role === 'sicurezza' ? 'Da Confermare' : 'Tutti');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));
  const tableRef = useRef<DataTableHandle>(null);
  const [activeColumnFilterCount, setActiveColumnFilterCount] = useState(0);

  // Sicurezza enters on the actually workable queue («Da Confermare»); Realizzazione sees all.
  useEffect(() => {
    setActiveFilter(role === 'sicurezza' ? 'Da Confermare' : 'Tutti');
  }, [role]);

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);

  const roleBaseRows = useMemo(() => {
    if (role === 'sicurezza') return allTasks.filter((t) => SICUREZZA_ALLOWED.includes(t.stato));
    return allTasks;
  }, [allTasks, role]);

  const statusFiltered = useMemo(
    () => (activeFilter === 'Tutti' ? roleBaseRows : filterByColumns(roleBaseRows, { stato: activeFilter })),
    [roleBaseRows, activeFilter]
  );

  const searched = useMemo(
    () =>
      filterRows(statusFiltered, search, [
        'protocollo',
        'systemRealizzazione',
        'systemSicurezza',
        'cliente',
        'citta',
        'provincia',
        'regione',
      ]),
    [statusFiltered, search]
  );

  const searchSuggestions: ComboboxOption[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: ComboboxOption[] = [];
    for (const t of statusFiltered) {
      for (const field of [t.protocollo, t.cliente, t.citta]) {
        if (out.length >= 8) break;
        if (!field.toLowerCase().includes(q) || seen.has(field)) continue;
        seen.add(field);
        out.push({ value: field, label: field });
      }
    }
    return out;
  }, [statusFiltered, search]);

  const filters = role === 'realizzazione' ? REALIZZAZIONE_FILTERS : SICUREZZA_FILTERS;
  const defaultFilter = role === 'sicurezza' ? 'Da Confermare' : 'Tutti';
  const hasActiveFilters = activeFilter !== defaultFilter || !!search || activeColumnFilterCount > 0;

  function resetAllFilters() {
    setActiveFilter(defaultFilter);
    setSearch('');
    tableRef.current?.clearFilters();
  }

  function openDetail(protocollo: string) {
    dispatch({ type: 'NAVIGATE', view: 'detail', protocollo });
  }

  const columns: ColumnDef<Task>[] = [
    {
      key: 'protocollo',
      header: 'Protocollo RC',
      width: '12%',
      render: (t) => <span className={styles.protocolloLink}>{t.protocollo}</span>,
    },
    { key: 'stato', header: 'Stato', width: '12%', render: (t) => <StatusPill status={t.stato} level="rc" /> },
    { key: 'lastUpdate', header: 'Last Update', width: '11%' },
    { key: 'systemRealizzazione', header: 'System Realizzazione', width: '12%' },
    { key: 'systemSicurezza', header: 'System Sicurezza', width: '12%' },
    { key: 'cliente', header: 'Cliente', width: '12%' },
    { key: 'citta', header: 'Città', width: '10%' },
    { key: 'provincia', header: 'Provincia', width: '8%' },
    { key: 'regione', header: 'Regione', width: '8%' },
    { key: 'areaFw', header: 'Area FW', width: '8%' },
  ];

  const todaysCards = useMemo(
    () => allTasks.filter((t) => t.appointments.some((a) => a.dataPianificazione === selectedDate)).slice(0, 3),
    [allTasks, selectedDate]
  );

  return (
    <div className={styles.wrap}>
      {role === 'realizzazione' ? (
        <>
          <div className={styles.dateHeaderRow}>
            <h1 className={styles.title}>{formatTodayLabel(new Date(parseDateLike(selectedDate)))}</h1>
            <DatePickerPopover value={selectedDate} onChange={setSelectedDate} id="list-today-date" />
          </div>
          <div className={styles.cardsRow}>
            {todaysCards.map((t) => {
              const appt = t.appointments.find((a) => a.dataPianificazione === selectedDate) ?? t.appointments[0];
              return (
                <button key={t.protocollo} className={styles.apptCard} onClick={() => openDetail(t.protocollo)}>
                  <div className={styles.apptCardTop}>
                    <span className={styles.apptTime}>{appt?.slot ?? '—'}</span>
                    <StatusPill status={t.stato} level="rc" />
                  </div>
                  <div className={styles.apptTaskId}>{t.protocollo}</div>
                  <div className={styles.apptAddress}>
                    <MapPin size={13} /> {t.citta}, {t.provincia}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <h1 className={styles.title}>Azioni rapide</h1>
          <div className={styles.quickRow}>
            <button
              className={styles.quickCardCalendario}
              onClick={() => dispatch({ type: 'NAVIGATE', view: 'calendarioGlobale' })}
            >
              <CalendarCheck size={22} />
              <div>
                <div className={styles.quickTitle}>Calendario globale</div>
                <div className={styles.quickSub}>Visualizza disponibilità RDLC e Operatori</div>
              </div>
            </button>
            <button className={styles.quickCardRiassegna} onClick={() => dispatch({ type: 'NAVIGATE', view: 'riassegna' })}>
              <ChatText size={22} />
              <div>
                <div className={styles.quickTitle}>Riassegna appuntamenti</div>
                <div className={styles.quickSub}>Sposta appuntamenti tra RDLC e Operatori</div>
              </div>
            </button>
          </div>
        </>
      )}

      <div className={styles.toolbar}>
        <div className={styles.chips}>
          {filters.map((f) => (
            <button
              key={f}
              className={`${styles.chip} ${activeFilter === f ? styles.chipActive : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <Combobox
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca RC, cliente, città..."
            aria-label="Cerca"
          />
        </div>
        <button className={styles.resetFiltersBtn} disabled={!hasActiveFilters} onClick={resetAllFilters}>
          <X size={13} /> Reset filtri
        </button>
      </div>

      <DataTable
        ref={tableRef}
        rows={searched}
        columns={columns}
        pageSize={8}
        rowKey={(t) => t.protocollo}
        onRowClick={(t) => openDetail(t.protocollo)}
        onActiveFilterCountChange={setActiveColumnFilterCount}
      />
    </div>
  );
}
