import { useMemo, useState } from 'react';
import { Star } from '@phosphor-icons/react';
import { AREAS } from '../../logic/operators';
import { formatDate } from '../../logic/dates';
import type { AreaFw, Operator, TimeSlot } from '../../types';
import { WORK_HOURS, slotsInHour } from '../../logic/timeSlots';
import styles from './RdlcDrawer.module.css';

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

export function RdlcDrawer({
  operators,
  currentOperatorName,
  onAssign,
  onClose,
}: {
  operators: Operator[];
  currentOperatorName: string;
  onAssign: (operatorName: string, day: string, slot: TimeSlot) => void;
  onClose: () => void;
}) {
  const [areaFilter, setAreaFilter] = useState<AreaFw | 'Tutte'>('Tutte');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(new Date());
  const [openCell, setOpenCell] = useState<{ opName: string; day: string; hour: number } | null>(null);

  const days = useMemo(() => weekDays(anchor), [anchor]);

  const filtered = operators.filter(
    (o) => (areaFilter === 'Tutte' || o.area === areaFilter) && o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Disponibilità operatori</h2>
          <button onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>
        <div className={styles.filters}>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as AreaFw | 'Tutte')}>
            <option value="Tutte">Tutte le aree</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input placeholder="Cerca operatore" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className={styles.weekNav}>
            <button onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))}>‹</button>
            <span>
              {formatDate(days[0])} – {formatDate(days[6])}
            </span>
            <button onClick={() => setAnchor((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))}>›</button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className={styles.empty}>Nessun operatore trovato.</div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.gridHeaderRow}>
              <div className={styles.opCol} />
              {days.map((d) => (
                <div key={d.toISOString()} className={styles.dayCol}>
                  {formatDate(d)}
                </div>
              ))}
            </div>
            {filtered.map((op) => (
              <div key={op.name} className={styles.gridRow}>
                <div className={styles.opCol}>
                  {op.name === currentOperatorName && <Star size={12} weight="fill" color="#B8720B" />} {op.name}
                </div>
                {days.map((d) => {
                  const dayStr = formatDate(d);
                  const isOpen = openCell?.opName === op.name && openCell.day === dayStr;
                  return (
                    <div key={d.toISOString()} className={styles.cell}>
                      {!isOpen ? (
                        <div className={styles.hourGrid}>
                          {WORK_HOURS.map((h) => (
                            <button
                              key={h}
                              className={styles.cellBtn}
                              onClick={() => setOpenCell({ opName: op.name, day: dayStr, hour: h })}
                            >
                              {String(h).padStart(2, '0')}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.slotPopover}>
                          {slotsInHour(openCell.hour).map((s) => (
                            <button
                              key={s}
                              className={styles.slotBtn}
                              onClick={() => {
                                onAssign(op.name, dayStr, s);
                                setOpenCell(null);
                              }}
                            >
                              {s}
                            </button>
                          ))}
                          <button className={styles.slotPopoverClose} onClick={() => setOpenCell(null)}>
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
