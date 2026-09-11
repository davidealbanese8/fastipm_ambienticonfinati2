import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { AREAS } from '../../logic/operators';
import { formatDate } from '../../logic/dates';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { Combobox, type ComboboxOption } from '../common/Combobox';
import type { AreaFw } from '../../types';
import { WORK_HOURS, hourOf } from '../../logic/timeSlots';
import { isRemoto } from '../../logic/rules';
import styles from './CalendarioGlobaleView.module.css';

function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface ApptMatch {
  protocollo: string;
  cliente: string;
  slot: string;
  stato: string;
  rdlc: string;
  operatore: string;
}

const STATUS_FILTERS = ['Tutti', 'Da Confermare', 'Da Rimodulare', 'Confermato'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function CalendarioGlobaleView() {
  const { tasks, operators } = useAppState();
  const dispatch = useAppDispatch();
  const [areaFilter, setAreaFilter] = useState<AreaFw | 'Tutte'>('Tutte');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Tutti');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(new Date());
  const [jumpDate, setJumpDate] = useState('');
  const [openMatch, setOpenMatch] = useState<ApptMatch | null>(null);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const allTasks = useMemo(() => Object.values(tasks), [tasks]);

  const areaOptions: ComboboxOption[] = [{ value: 'Tutte', label: 'Tutte le aree' }, ...AREAS.map((a) => ({ value: a, label: a }))];

  const areaScopedOperators = operators.filter((o) => areaFilter === 'Tutte' || o.area === areaFilter);
  const searchSuggestions: ComboboxOption[] = areaScopedOperators
    .filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8)
    .map((o) => ({ value: o.name, label: o.name }));

  const filteredOps = operators.filter(
    (o) => (areaFilter === 'Tutte' || o.area === areaFilter) && o.name.toLowerCase().includes(search.toLowerCase())
  );

  function cellMatches(operatorName: string, day: Date, hour: number): ApptMatch[] {
    const dayStr = formatDate(day);
    const matches: ApptMatch[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        const effectiveDay = a.dataRdlc || a.dataPianificazione;
        const effectiveSlot = a.slotRdlc || a.slot;
        if (statusFilter !== 'Tutti' && a.stato !== statusFilter) continue;
        if (a.rdlc === operatorName && effectiveDay === dayStr && hourOf(effectiveSlot) === hour) {
          matches.push({
            protocollo: t.protocollo,
            cliente: t.cliente,
            slot: effectiveSlot,
            stato: a.stato,
            rdlc: a.rdlc,
            operatore: a.operatore,
          });
        }
      }
    }
    return matches;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
          <CaretLeft size={18} />
        </button>
        <h1 className={styles.title}>Calendario globale</h1>
      </div>
      <div className={styles.pillRow}>
        <span className={styles.pillRowLabel}>Stato</span>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={statusFilter === s ? styles.pillActive : styles.pill}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <Combobox
          className={styles.areaCombobox}
          options={areaOptions}
          value={areaFilter}
          onChange={(v) => setAreaFilter(v as AreaFw | 'Tutte')}
          placeholder="Tutte le aree"
        />
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <Combobox
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca operatore"
            aria-label="Cerca operatore"
          />
        </div>
        <div className={styles.weekNav}>
          <button onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))} aria-label="Settimana precedente">
            <CaretLeft size={14} />
          </button>
          <span>
            {formatDate(days[0])} – {formatDate(days[6])}
          </span>
          <button onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))} aria-label="Settimana successiva">
            <CaretRight size={14} />
          </button>
        </div>
        <DatePickerPopover
          label="Vai a giorno"
          value={jumpDate}
          onChange={(v) => {
            setJumpDate(v);
            const [dd, mm, yyyy] = v.split('/');
            if (dd && mm && yyyy) setAnchor(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
          }}
          id="calendario-jump"
        />
      </div>

      {filteredOps.length === 0 ? (
        <div className={styles.empty}>Nessun operatore trovato con i filtri correnti.</div>
      ) : (
        <div className={styles.gridWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>RDLC</th>
                {days.map((d) => (
                  <th key={d.toISOString()} colSpan={WORK_HOURS.length}>
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
              <tr>
                <th></th>
                {days.map((d) =>
                  WORK_HOURS.map((h) => (
                    <th key={d.toISOString() + h} className={styles.hourHeader}>
                      {String(h).padStart(2, '0')}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((op) => (
                <tr key={op.name}>
                  <td className={styles.opCell}>{op.name}</td>
                  {days.map((d) =>
                    WORK_HOURS.map((h) => {
                      const matches = cellMatches(op.name, d, h);
                      return (
                        <td key={d.toISOString() + h} className={styles.cell}>
                          {matches.length === 0 ? (
                            <span className={styles.libero}>Libero</span>
                          ) : (
                            <div className={styles.chipStack}>
                              {matches.map((m) => (
                                <button
                                  key={m.protocollo + m.slot}
                                  type="button"
                                  className={styles.apptChip}
                                  onClick={() => setOpenMatch(m)}
                                >
                                  {m.slot}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openMatch && (
        <div className={styles.detailsPopover} onClick={() => setOpenMatch(null)}>
          <div className={styles.detailsCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailsRow}>
              <strong>{openMatch.protocollo}</strong> — {openMatch.cliente}
            </div>
            <div className={styles.detailsRow}>Slot: {openMatch.slot}</div>
            <div className={styles.detailsRow}>RDLC: {openMatch.rdlc || '—'}</div>
            <div className={styles.detailsRow}>Operatore: {openMatch.operatore || '—'}</div>
            <div className={styles.detailsRow}>Modalità: {isRemoto(openMatch) ? 'Da remoto' : 'In presenza'}</div>
            <button className={styles.detailsClose} onClick={() => setOpenMatch(null)}>
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
