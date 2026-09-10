import { useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { AREAS, suggestLeastLoadedOperator } from '../../logic/operators';
import { parseDateLike } from '../../logic/dates';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { StatusPill } from '../common/StatusPill';
import type { AreaFw, Task } from '../../types';
import { formatSlotRange } from '../../logic/timeSlots';
import styles from './RiassegnaView.module.css';

interface ResultRow {
  protocollo: string;
  apptId: number;
  data: string;
  slot: string;
  stato: Task['appointments'][number]['stato'];
  currentOperatore: string;
  suggested: string;
}

export function RiassegnaView() {
  const { tasks, operators } = useAppState();
  const dispatch = useAppDispatch();
  const [operatorName, setOperatorName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [rowOperator, setRowOperator] = useState<Record<number, string>>({});
  const [rowRemoteOperator, setRowRemoteOperator] = useState<Record<number, string>>({});
  const [doneRemoteIds, setDoneRemoteIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  const searchReady = !!operatorName && !!fromDate && !!toDate;

  const operatorsByArea = useMemo(() => {
    const map: Record<AreaFw, typeof operators> = { 'Nord Est': [], 'Nord Ovest': [], Centro: [], Sud: [] };
    for (const o of operators) map[o.area].push(o);
    return map;
  }, [operators]);

  function runSearch() {
    if (!searchReady) return;
    const fromTs = parseDateLike(fromDate);
    const toTs = parseDateLike(toDate);
    const rows: ResultRow[] = [];
    const initRowOperator: Record<number, string> = {};
    for (const t of allTasks) {
      for (const a of t.appointments) {
        if (a.rdlc !== operatorName) continue;
        const effectiveDate = a.dataRdlc || a.dataPianificazione;
        const ts = parseDateLike(effectiveDate);
        if (Number.isNaN(ts) || ts < fromTs || ts > toTs) continue;
        const suggestion = suggestLeastLoadedOperator(t.areaFw, operators, allTasks);
        rows.push({
          protocollo: t.protocollo,
          apptId: a.id,
          data: effectiveDate,
          slot: a.slotRdlc || a.slot,
          stato: a.stato,
          currentOperatore: a.operatore,
          suggested: suggestion?.name ?? '',
        });
        initRowOperator[a.id] = suggestion?.name ?? '';
      }
    }
    setResults(rows);
    setRowOperator(initRowOperator);
    setRowRemoteOperator(Object.fromEntries(rows.map((r) => [r.apptId, r.currentOperatore])));
    setDoneRemoteIds([]);
    setDoneIds([]);
    setSelected([]);
  }

  function assignRow(row: ResultRow) {
    const newOp = rowOperator[row.apptId];
    if (!newOp) return;
    dispatch({ type: 'REASSIGN_RDLC', protocollo: row.protocollo, apptId: row.apptId, operatorName: newOp });
    setDoneIds((d) => [...d, row.apptId]);
  }

  function assignRemoteRow(row: ResultRow) {
    dispatch({
      type: 'REASSIGN_REMOTE_OPERATOR',
      protocollo: row.protocollo,
      apptId: row.apptId,
      operatore: rowRemoteOperator[row.apptId] ?? '',
    });
    setDoneRemoteIds((d) => [...d, row.apptId]);
  }

  function assignBulk() {
    if (!results) return;
    for (const row of results) {
      if (!selected.includes(row.apptId)) continue;
      assignRow(row);
    }
    setSelected([]);
  }

  function confirmRiassegnazione() {
    setResults((prev) => (prev ? prev.filter((r) => !doneIds.includes(r.apptId)) : prev));
    setConfirmOpen(false);
    dispatch({ type: 'SHOW_TOAST', message: 'Riassegnazione confermata.' });
  }

  const visibleRows = results ?? [];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Riassegna appuntamenti</h1>

      <div className={styles.searchForm}>
        <label className={styles.formField}>
          <span>Operatore</span>
          <select value={operatorName} onChange={(e) => setOperatorName(e.target.value)}>
            <option value="">Seleziona operatore</option>
            {AREAS.map((area) => (
              <optgroup key={area} label={area}>
                {operatorsByArea[area].map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <DatePickerPopover label="Da" value={fromDate} onChange={setFromDate} id="riassegna-from" />
        <DatePickerPopover label="A" value={toDate} onChange={setToDate} id="riassegna-to" />
        <Button variant="primary" disabled={!searchReady} onClick={runSearch}>
          Cerca
        </Button>
      </div>

      {results === null ? (
        <div className={styles.empty}>Imposta operatore e periodo per cercare gli appuntamenti da riassegnare.</div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.empty}>Nessun appuntamento trovato per i criteri selezionati.</div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <span>{selected.length} selezionati</span>
            <Button variant="rdlc" disabled={selected.length === 0} onClick={assignBulk}>
              Assegna selezionati
            </Button>
            <Button variant="primary" disabled={doneIds.length === 0} onClick={() => setConfirmOpen(true)}>
              Conferma riassegnazione
            </Button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Protocollo</th>
                  <th>Data</th>
                  <th>Slot</th>
                  <th>Stato</th>
                  <th>Nuovo RDLC</th>
                  <th>Azioni</th>
                  <th>Operatore (remoto)</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.apptId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.apptId)}
                        onChange={() =>
                          setSelected((s) => (s.includes(row.apptId) ? s.filter((i) => i !== row.apptId) : [...s, row.apptId]))
                        }
                      />
                    </td>
                    <td>{row.protocollo}</td>
                    <td>{row.data}</td>
                    <td>{formatSlotRange(row.slot)}</td>
                    <td>
                      <StatusPill status={row.stato} level="appointment" />
                    </td>
                    <td>
                      <select
                        value={rowOperator[row.apptId] ?? ''}
                        onChange={(e) => setRowOperator((r) => ({ ...r, [row.apptId]: e.target.value }))}
                      >
                        <option value="">Seleziona</option>
                        {operators.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Button
                        variant="success"
                        disabled={doneIds.includes(row.apptId) || !rowOperator[row.apptId]}
                        onClick={() => assignRow(row)}
                      >
                        {doneIds.includes(row.apptId) ? 'Assegnato' : 'Assegna'}
                      </Button>
                    </td>
                    <td>
                      <select
                        value={rowRemoteOperator[row.apptId] ?? ''}
                        onChange={(e) => setRowRemoteOperator((r) => ({ ...r, [row.apptId]: e.target.value }))}
                      >
                        <option value="">Nessuno — in presenza</option>
                        {operators.map((o) => (
                          <option key={o.name} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Button
                        variant="success"
                        disabled={doneRemoteIds.includes(row.apptId)}
                        onClick={() => assignRemoteRow(row)}
                      >
                        {doneRemoteIds.includes(row.apptId) ? 'Assegnato' : 'Assegna'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmOpen && (
        <Modal
          title="Conferma riassegnazione"
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <Button variant="neutral" onClick={() => setConfirmOpen(false)}>
                Annulla
              </Button>
              <Button variant="primary" onClick={confirmRiassegnazione}>
                Conferma
              </Button>
            </>
          }
        >
          <p>{doneIds.length} appuntamenti sono stati riassegnati. Confermi il completamento dell'operazione?</p>
        </Modal>
      )}
    </div>
  );
}
