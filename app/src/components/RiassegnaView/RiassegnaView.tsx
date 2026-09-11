import { useMemo, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { AREAS, operatoreOptionsWithCounts, operatorOptionsWithCounts, suggestLeastLoadedOperator } from '../../logic/operators';
import { parseDateLike } from '../../logic/dates';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { StatusPill } from '../common/StatusPill';
import { Combobox, type ComboboxOption } from '../common/Combobox';
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

// Appointment ids are only unique within a single task, not across tasks — and results
// here span many tasks — so every row-identity lookup (React key, selection, per-row
// pending state) must key on protocollo+apptId together, never apptId alone.
function rowKey(row: Pick<ResultRow, 'protocollo' | 'apptId'>): string {
  return `${row.protocollo}:${row.apptId}`;
}

export function RiassegnaView() {
  const { tasks, operators } = useAppState();
  const dispatch = useAppDispatch();
  const [operatorName, setOperatorName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [rowOperator, setRowOperator] = useState<Record<string, string>>({});
  const [rowRemoteOperator, setRowRemoteOperator] = useState<Record<string, string>>({});
  const [doneRemoteIds, setDoneRemoteIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  const searchReady = !!operatorName && !!fromDate && !!toDate;

  const operatorsByArea = useMemo(() => {
    const map: Record<AreaFw, typeof operators> = { 'Nord Est': [], 'Nord Ovest': [], Centro: [], Sud: [] };
    for (const o of operators) map[o.area].push(o);
    return map;
  }, [operators]);

  const operatorOptions: ComboboxOption[] = useMemo(
    () =>
      AREAS.flatMap((area) =>
        operatorOptionsWithCounts(operatorsByArea[area], allTasks).map((o) => ({ ...o, group: area }))
      ),
    [operatorsByArea, allTasks]
  );

  // "Nuovo RDLC" is scoped to each row's own RC area (RDLC is always area-bound);
  // "Operatore (remoto)" uses the separate, area-independent Operatore pool.
  function rdlcOptionsForRow(protocollo: string): ComboboxOption[] {
    const area = allTasks.find((t) => t.protocollo === protocollo)?.areaFw;
    if (!area) return [];
    return operatorOptionsWithCounts(operatorsByArea[area], allTasks);
  }

  const operatoreOptions: ComboboxOption[] = useMemo(() => operatoreOptionsWithCounts(allTasks), [allTasks]);
  const operatoreOptionsWithNone: ComboboxOption[] = useMemo(
    () => [{ value: '', label: 'Nessuno — in presenza' }, ...operatoreOptions],
    [operatoreOptions]
  );

  function runSearch() {
    if (!searchReady) return;
    const fromTs = parseDateLike(fromDate);
    const toTs = parseDateLike(toDate);
    const rows: ResultRow[] = [];
    const initRowOperator: Record<string, string> = {};
    for (const t of allTasks) {
      for (const a of t.appointments) {
        if (a.rdlc !== operatorName) continue;
        const effectiveDate = a.dataRdlc || a.dataPianificazione;
        const ts = parseDateLike(effectiveDate);
        if (Number.isNaN(ts) || ts < fromTs || ts > toTs) continue;
        const suggestion = suggestLeastLoadedOperator(t.areaFw, operators, allTasks);
        const row: ResultRow = {
          protocollo: t.protocollo,
          apptId: a.id,
          data: effectiveDate,
          slot: a.slotRdlc || a.slot,
          stato: a.stato,
          currentOperatore: a.operatore,
          suggested: suggestion?.name ?? '',
        };
        rows.push(row);
        initRowOperator[rowKey(row)] = suggestion?.name ?? '';
      }
    }
    setResults(rows);
    setRowOperator(initRowOperator);
    setRowRemoteOperator(Object.fromEntries(rows.map((r) => [rowKey(r), r.currentOperatore])));
    setDoneRemoteIds([]);
    setDoneIds([]);
    setSelected([]);
  }

  function assignRow(row: ResultRow) {
    const newOp = rowOperator[rowKey(row)];
    if (!newOp) return;
    dispatch({ type: 'REASSIGN_RDLC', protocollo: row.protocollo, apptId: row.apptId, operatorName: newOp });
    setDoneIds((d) => [...d, rowKey(row)]);
  }

  function assignRemoteRow(row: ResultRow) {
    dispatch({
      type: 'REASSIGN_REMOTE_OPERATOR',
      protocollo: row.protocollo,
      apptId: row.apptId,
      operatore: rowRemoteOperator[rowKey(row)] ?? '',
    });
    setDoneRemoteIds((d) => [...d, rowKey(row)]);
  }

  function assignBulk() {
    if (!results) return;
    for (const row of results) {
      if (!selected.includes(rowKey(row))) continue;
      assignRow(row);
    }
    setSelected([]);
  }

  function confirmRiassegnazione() {
    setResults((prev) => (prev ? prev.filter((r) => !doneIds.includes(rowKey(r))) : prev));
    setConfirmOpen(false);
    dispatch({ type: 'SHOW_TOAST', message: 'Riassegnazione confermata.' });
  }

  const visibleRows = results ?? [];

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
          <CaretLeft size={18} />
        </button>
        <h1 className={styles.title}>Riassegna appuntamenti</h1>
      </div>

      <div className={styles.searchForm}>
        <label className={styles.formField}>
          <span>Operatore</span>
          <Combobox className={styles.operatoreField} options={operatorOptions} value={operatorName} onChange={setOperatorName} placeholder="Seleziona operatore" />
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
            <div className={styles.toolbarActions}>
              <Button variant="primary" disabled={selected.length === 0} onClick={assignBulk}>
                Assegna selezionati
              </Button>
              <Button variant="primary" disabled={doneIds.length === 0} onClick={() => setConfirmOpen(true)}>
                Conferma riassegnazione
              </Button>
            </div>
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
                {visibleRows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={() =>
                            setSelected((s) => (s.includes(key) ? s.filter((i) => i !== key) : [...s, key]))
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
                        <Combobox
                          options={rdlcOptionsForRow(row.protocollo)}
                          value={rowOperator[key] ?? ''}
                          onChange={(v) => setRowOperator((r) => ({ ...r, [key]: v }))}
                          placeholder="Seleziona"
                        />
                      </td>
                      <td>
                        <Button
                          variant="success"
                          disabled={doneIds.includes(key) || !rowOperator[key]}
                          onClick={() => assignRow(row)}
                        >
                          {doneIds.includes(key) ? 'Assegnato' : 'Assegna'}
                        </Button>
                      </td>
                      <td>
                        <Combobox
                          options={operatoreOptionsWithNone}
                          value={rowRemoteOperator[key] ?? ''}
                          onChange={(v) => setRowRemoteOperator((r) => ({ ...r, [key]: v }))}
                          placeholder="Nessuno — in presenza"
                        />
                      </td>
                      <td>
                        <Button
                          variant="success"
                          disabled={doneRemoteIds.includes(key)}
                          onClick={() => assignRemoteRow(row)}
                        >
                          {doneRemoteIds.includes(key) ? 'Assegnato' : 'Assegna'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
