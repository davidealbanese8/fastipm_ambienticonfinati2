import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, Star } from '@phosphor-icons/react';
import { useAppState } from '../../state/AppContext';
import { formatDate } from '../../logic/dates';
import type { Operator, TimeSlot } from '../../types';
import { WORK_HOURS, hourOf, slotsInHour } from '../../logic/timeSlots';
import { Combobox, type ComboboxOption } from './Combobox';
import { DatePickerPopover } from './DatePickerPopover';
import styles from './RdlcDrawer.module.css';

const STATUS_FILTERS = ['Tutti', 'Da Confermare', 'Da Rimodulare', 'Confermato'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  const dow = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface CellAppt {
  protocollo: string;
  slot: string;
  stato: string;
}

export function RdlcDrawer({
  operators,
  currentOperatorName,
  cameretta,
  targetDay,
  onAssign,
  onClose,
}: {
  operators: Operator[];
  currentOperatorName: string;
  cameretta?: string;
  targetDay?: string;
  onAssign: (operatorName: string, day: string, slot: TimeSlot) => void;
  onClose: () => void;
}) {
  const { tasks } = useAppState();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Tutti');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(() => {
    if (targetDay) {
      const [dd, mm, yyyy] = targetDay.split('/');
      if (dd && mm && yyyy) return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    }
    return new Date();
  });
  const [jumpDate, setJumpDate] = useState('');
  const [openCell, setOpenCell] = useState<{ opName: string; day: string; hour: number } | null>(null);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const allTasks = useMemo(() => Object.values(tasks), [tasks]);

  const filtered = operators.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const searchSuggestions: ComboboxOption[] = filtered.slice(0, 8).map((o) => ({ value: o.name, label: o.name }));

  function cellAppts(operatorName: string, dayStr: string, hour: number): CellAppt[] {
    const out: CellAppt[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        // An operator can be busy either as RDLC or as the remote-assist Operatore.
        if (a.rdlc !== operatorName && a.operatore !== operatorName) continue;
        if (a.dataPianificazione !== dayStr || hourOf(a.slot) !== hour) continue;
        if (statusFilter !== 'Tutti' && a.stato !== statusFilter) continue;
        out.push({ protocollo: t.protocollo, slot: a.slot, stato: a.stato });
      }
    }
    return out;
  }

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Disponibilità operatori</h2>
            {cameretta && (
              <div className={styles.subtitle}>
                {cameretta}
                {targetDay ? ` · appuntamento ${targetDay}` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Chiudi">
            ×
          </button>
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

        <div className={styles.filters}>
          <Combobox
            className={styles.searchField}
            options={searchSuggestions}
            value={search}
            onChange={setSearch}
            freeSolo
            placeholder="Cerca operatore"
            aria-label="Cerca operatore"
          />
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
            value={jumpDate}
            onChange={(v) => {
              setJumpDate(v);
              const [dd, mm, yyyy] = v.split('/');
              if (dd && mm && yyyy) setAnchor(new Date(Number(yyyy), Number(mm) - 1, Number(dd)));
            }}
            id="rdlc-drawer-jump"
          />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>Nessun operatore trovato.</div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.gridHeaderRow}>
              <div className={styles.opCol} />
              {days.map((d) => {
                const dayStr = formatDate(d);
                return (
                  <div key={d.toISOString()} className={dayStr === targetDay ? styles.dayColTarget : styles.dayCol}>
                    {dayStr}
                  </div>
                );
              })}
            </div>
            {filtered.map((op) => (
              <div key={op.name} className={styles.gridRow}>
                <div className={styles.opCol}>
                  <div className={styles.opName}>
                    {op.name === currentOperatorName && <Star size={12} weight="fill" color="#B8720B" />} {op.name}
                  </div>
                  <div className={styles.opArea}>{op.area}</div>
                </div>
                {days.map((d) => {
                  const dayStr = formatDate(d);
                  const isOpen = openCell?.opName === op.name && openCell.day === dayStr;
                  const isTarget = dayStr === targetDay;
                  return (
                    <div key={d.toISOString()} className={isTarget ? styles.cellTarget : styles.cell}>
                      {!isOpen ? (
                        <div className={styles.hourGrid}>
                          {WORK_HOURS.map((h) => {
                            const appts = cellAppts(op.name, dayStr, h);
                            return (
                              <button
                                key={h}
                                type="button"
                                className={appts.length > 0 ? styles.cellBtnBusy : styles.cellBtnFree}
                                onClick={() => setOpenCell({ opName: op.name, day: dayStr, hour: h })}
                                title={appts.length > 0 ? appts.map((a) => `${a.protocollo} (${a.stato})`).join(', ') : 'Libero'}
                              >
                                <span className={styles.cellBtnHour}>{String(h).padStart(2, '0')}</span>
                                {appts.length > 0 && (
                                  <span className={styles.cellBtnStatus}>{appts.length} imp.</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.slotPopover}>
                          {slotsInHour(openCell.hour).map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={styles.slotBtn}
                              onClick={() => {
                                onAssign(op.name, dayStr, s);
                                setOpenCell(null);
                              }}
                            >
                              {s}
                            </button>
                          ))}
                          <button type="button" className={styles.slotPopoverClose} onClick={() => setOpenCell(null)}>
                            Chiudi
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
