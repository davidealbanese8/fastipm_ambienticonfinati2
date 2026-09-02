import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { AREAS } from '../../logic/operators';
import { formatDate } from '../../logic/dates';
import { DatePickerPopover } from '../common/DatePickerPopover';
import type { AreaFw, FasciaOraria } from '../../types';
import styles from './CalendarioGlobaleView.module.css';

const FASCE: FasciaOraria[] = ['09:00 - 13:00', '14:00 - 18:00'];

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

export function CalendarioGlobaleView() {
  const { tasks, operators } = useAppState();
  const [areaFilter, setAreaFilter] = useState<AreaFw | 'Tutte'>('Tutte');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(new Date());
  const [jumpDate, setJumpDate] = useState('');

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const allTasks = useMemo(() => Object.values(tasks), [tasks]);

  const filteredOps = operators.filter(
    (o) => (areaFilter === 'Tutte' || o.area === areaFilter) && o.name.toLowerCase().includes(search.toLowerCase())
  );

  function cellStatuses(operatorName: string, day: Date, fascia: FasciaOraria) {
    const dayStr = formatDate(day);
    const matches: string[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        const effectiveDay = a.dataRdlc || a.dataPianificazione;
        const effectiveFascia = a.fasciaOrariaRdlc || a.fasciaOraria;
        if (a.rdlc === operatorName && effectiveDay === dayStr && effectiveFascia === fascia) {
          matches.push(a.stato);
        }
      }
    }
    return matches;
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Calendario globale</h1>
      <div className={styles.toolbar}>
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as AreaFw | 'Tutte')}>
          <option value="Tutte">Tutte le aree</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className={styles.search}>
          <MagnifyingGlass size={15} />
          <input placeholder="Cerca operatore" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <th>Operatore</th>
                {days.map((d) => (
                  <th key={d.toISOString()} colSpan={2}>
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
              <tr>
                <th></th>
                {days.map((d) =>
                  FASCE.map((f) => <th key={d.toISOString() + f} className={styles.fasciaHeader}>{f.split(' - ')[0]}</th>)
                )}
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((op) => (
                <tr key={op.name}>
                  <td className={styles.opCell}>{op.name}</td>
                  {days.map((d) =>
                    FASCE.map((f) => {
                      const matches = cellStatuses(op.name, d, f);
                      return (
                        <td key={d.toISOString() + f} className={styles.cell}>
                          {matches.length === 0 ? (
                            <span className={styles.libero}>Libero</span>
                          ) : (
                            <span className={styles.countPill}>{matches.length}</span>
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
    </div>
  );
}
