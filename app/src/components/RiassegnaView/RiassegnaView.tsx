import { useMemo, useState } from 'react';
import { CaretLeft, CheckCircle } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import {
  AREAS,
  operatoreOptionsWithCounts,
  rdlcOptionsWithCounts,
  suggestLeastLoadedRdlc,
} from '../../logic/operators';
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
  currentRdlc: string;
  currentOperatore: string;
}

// Appointment ids are only unique within a single task, not across tasks — and results
// here span many tasks — so every row-identity lookup (React key, selection, per-row
// pending state) must key on protocollo+apptId together, never apptId alone.
function rowKey(row: Pick<ResultRow, 'protocollo' | 'apptId'>): string {
  return `${row.protocollo}:${row.apptId}`;
}

const NESSUN_OPERATORE = 'Nessuno — in presenza';

export function RiassegnaView() {
  const { tasks, operators } = useAppState();
  const dispatch = useAppDispatch();
  // The two searchable roles are separate pools filling separate fields: rdlcName matches
  // Appointment.rdlc, operatoreName matches Appointment.operatore. Either alone is a valid
  // search; together they AND.
  const [rdlcName, setRdlcName] = useState('');
  const [operatoreName, setOperatoreName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [rowRdlc, setRowRdlc] = useState<Record<string, string>>({});
  const [rowOperatore, setRowOperatore] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  // The values last actually applied (dispatched) per row — as opposed to rowRdlc/rowOperatore,
  // which track each combobox's current (possibly not-yet-applied) selection. A row is
  // "handled" (green) once it has an applied entry here; picking a *different* name afterward
  // re-enables "Assegna" so it can be reassigned again, without losing the green evidence.
  const [appliedRdlcFor, setAppliedRdlcFor] = useState<Map<string, string>>(new Map());
  const [appliedOperatoreFor, setAppliedOperatoreFor] = useState<Map<string, string>>(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doneIds = useMemo(
    () => Array.from(new Set([...appliedRdlcFor.keys(), ...appliedOperatoreFor.keys()])),
    [appliedRdlcFor, appliedOperatoreFor]
  );

  const allTasks = useMemo(() => Object.values(tasks), [tasks]);
  // At least one of the two roles must be named — the period alone would match everything.
  const searchReady = (!!rdlcName || !!operatoreName) && !!fromDate && !!toDate;

  const operatorsByArea = useMemo(() => {
    const map: Record<AreaFw, typeof operators> = { 'Nord Est': [], 'Nord Ovest': [], Centro: [], Sud: [] };
    for (const o of operators) map[o.area].push(o);
    return map;
  }, [operators]);

  const rdlcSearchOptions: ComboboxOption[] = useMemo(
    () =>
      AREAS.flatMap((area) =>
        rdlcOptionsWithCounts(operatorsByArea[area], allTasks).map((o) => ({ ...o, group: area }))
      ),
    [operatorsByArea, allTasks]
  );

  const operatoreOptions: ComboboxOption[] = useMemo(() => operatoreOptionsWithCounts(allTasks), [allTasks]);
  const operatoreOptionsWithNone: ComboboxOption[] = useMemo(
    () => [{ value: '', label: NESSUN_OPERATORE }, ...operatoreOptions],
    [operatoreOptions]
  );

  const areaByProtocollo = useMemo(() => {
    const m = new Map<string, AreaFw>();
    for (const t of allTasks) m.set(t.protocollo, t.areaFw);
    return m;
  }, [allTasks]);

  const areaByRdlcName = useMemo(() => {
    const m = new Map<string, AreaFw>();
    for (const o of operators) m.set(o.name, o.area);
    return m;
  }, [operators]);

  // The RDLC menu is scoped to each row's own RC area (RDLC is always area-bound), so it
  // cannot be hoisted into a single shared list the way the Operatore one can.
  function rdlcOptionsForRow(protocollo: string): ComboboxOption[] {
    const area = areaByProtocollo.get(protocollo);
    if (!area) return [];
    return rdlcOptionsWithCounts(operatorsByArea[area], allTasks);
  }

  function runSearch() {
    if (!searchReady) return;
    const fromTs = parseDateLike(fromDate);
    const toTs = parseDateLike(toDate);
    const rows: ResultRow[] = [];
    for (const t of allTasks) {
      for (const a of t.appointments) {
        if (rdlcName && a.rdlc !== rdlcName) continue;
        if (operatoreName && a.operatore !== operatoreName) continue;
        const effectiveDate = a.dataRdlc || a.dataPianificazione;
        const ts = parseDateLike(effectiveDate);
        if (Number.isNaN(ts) || ts < fromTs || ts > toTs) continue;
        rows.push({
          protocollo: t.protocollo,
          apptId: a.id,
          data: effectiveDate,
          slot: a.slotRdlc || a.slot,
          stato: a.stato,
          currentRdlc: a.rdlc,
          currentOperatore: a.operatore,
        });
      }
    }
    setResults(rows);
    // Each row's RDLC combobox pre-fills with the least-loaded suggestion for that row's own
    // area; the Operatore one keeps whatever the appointment already has.
    setRowRdlc(
      Object.fromEntries(
        rows.map((r) => {
          const area = allTasks.find((t) => t.protocollo === r.protocollo)?.areaFw;
          const suggestion = area ? suggestLeastLoadedRdlc(area, operators, allTasks) : undefined;
          return [rowKey(r), suggestion?.name ?? ''];
        })
      )
    );
    setRowOperatore(Object.fromEntries(rows.map((r) => [rowKey(r), r.currentOperatore])));
    setAppliedRdlcFor(new Map());
    setAppliedOperatoreFor(new Map());
    setSelected([]);
  }

  /** Applies whichever of the two roles actually changed on this row. */
  function assignRow(row: ResultRow, nextRdlc?: string, nextOperatore?: string) {
    const key = rowKey(row);
    const rdlc = nextRdlc ?? rowRdlc[key] ?? '';
    const operatore = nextOperatore ?? rowOperatore[key] ?? '';

    const rdlcChanged = !!rdlc && rdlc !== appliedRdlcFor.get(key);
    if (rdlcChanged) {
      dispatch({ type: 'REASSIGN_RDLC', protocollo: row.protocollo, apptId: row.apptId, rdlcName: rdlc });
      setAppliedRdlcFor((m) => new Map(m).set(key, rdlc));
    }

    // rules.reassignRdlc deliberately clears the Operatore when the RDLC changes (the
    // remote-assist pairing doesn't survive a new RDLC). So after an RDLC change we must
    // re-send the Operatore we intend to keep, or the grid would keep displaying a name
    // the store has already dropped.
    const operatoreApplied = appliedOperatoreFor.get(key) ?? row.currentOperatore;
    if (operatore !== operatoreApplied) {
      // Explicit pick, including clearing it back to "in presenza".
      dispatch({ type: 'REASSIGN_OPERATORE', protocollo: row.protocollo, apptId: row.apptId, operatore });
      setAppliedOperatoreFor((m) => new Map(m).set(key, operatore));
    } else if (rdlcChanged) {
      // Unchanged, but the RDLC dispatch just wiped it — restore it (nothing to send when
      // it was already empty; the store agrees).
      if (operatore) {
        dispatch({ type: 'REASSIGN_OPERATORE', protocollo: row.protocollo, apptId: row.apptId, operatore });
      }
      setAppliedOperatoreFor((m) => new Map(m).set(key, operatore));
    }
  }

  const selectedRows = useMemo(
    () => (results ?? []).filter((r) => selected.includes(rowKey(r))),
    [results, selected]
  );

  // Only RDLC from areas actually present in the selection: an RDLC is area-bound, so
  // offering the whole roster would let you pick someone who can serve none of the
  // selected rows.
  const bulkRdlcOptions: ComboboxOption[] = useMemo(() => {
    const areas = new Set<AreaFw>();
    for (const row of selectedRows) {
      const a = areaByProtocollo.get(row.protocollo);
      if (a) areas.add(a);
    }
    return AREAS.filter((a) => areas.has(a)).flatMap((area) =>
      rdlcOptionsWithCounts(operatorsByArea[area], allTasks).map((o) => ({ ...o, group: area }))
    );
  }, [selectedRows, areaByProtocollo, operatorsByArea, allTasks]);

  /** Bulk pick: sets the combobox AND applies it in one go, so the rows turn green
   *  immediately — picking a name is the action, there is no second confirm step. */
  function bulkAssignRdlc(name: string) {
    if (!name) return;
    const rdlcArea = areaByRdlcName.get(name);
    const targets = selectedRows.filter((row) => areaByProtocollo.get(row.protocollo) === rdlcArea);
    const skipped = selectedRows.length - targets.length;

    setRowRdlc((r) => {
      const next = { ...r };
      for (const row of targets) next[rowKey(row)] = name;
      return next;
    });
    for (const row of targets) assignRow(row, name, rowOperatore[rowKey(row)] ?? row.currentOperatore);

    if (skipped > 0) {
      dispatch({
        type: 'SHOW_TOAST',
        message: `${name} assegnato a ${targets.length} appuntamenti. ${skipped} saltati: fuori area ${rdlcArea ?? ''}.`,
      });
    }
  }

  function bulkAssignOperatore(name: string) {
    setRowOperatore((r) => {
      const next = { ...r };
      for (const row of selectedRows) next[rowKey(row)] = name;
      return next;
    });
    for (const row of selectedRows) assignRow(row, rowRdlc[rowKey(row)], name);
  }

  function confirmRiassegnazione() {
    setResults((prev) => (prev ? prev.filter((r) => !doneIds.includes(rowKey(r))) : prev));
    setConfirmOpen(false);
    dispatch({ type: 'SHOW_TOAST', message: 'Riassegnazione confermata.' });
  }

  const visibleRows = results ?? [];
  const allSelected = visibleRows.length > 0 && selected.length === visibleRows.length;
  const someSelected = selected.length > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? [] : visibleRows.map(rowKey));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
          <CaretLeft size={18} />
        </button>
        <h1 className={styles.title}>Riassegna appuntamenti</h1>
        <Button variant="primary" className={styles.confirmBtn} disabled={doneIds.length === 0} onClick={() => setConfirmOpen(true)}>
          <CheckCircle size={16} weight="bold" />
          Conferma riassegnazione
        </Button>
      </div>

      <div className={styles.searchForm}>
        <div className={styles.formField}>
          <span className={styles.formLabel}>RDLC da sostituire</span>
          <Combobox
            className={styles.searchCombo}
            options={rdlcSearchOptions}
            value={rdlcName}
            onChange={setRdlcName}
            placeholder="Tutti gli RDLC"
          />
        </div>
        <div className={styles.formField}>
          <span className={styles.formLabel}>Operatore da sostituire</span>
          <Combobox
            className={styles.searchCombo}
            options={operatoreOptions}
            value={operatoreName}
            onChange={setOperatoreName}
            placeholder="Tutti gli operatori"
          />
        </div>
        <DatePickerPopover label="Dal" value={fromDate} onChange={setFromDate} id="riassegna-from" />
        <DatePickerPopover label="Al" value={toDate} onChange={setToDate} id="riassegna-to" />
        <Button variant="primary" className={styles.searchBtn} disabled={!searchReady} onClick={runSearch}>
          Cerca
        </Button>
      </div>

      {results === null ? (
        <div className={styles.empty}>
          Indica un RDLC o un Operatore da sostituire e il periodo, poi premi Cerca.
        </div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.empty}>Nessun appuntamento trovato per i criteri selezionati.</div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <h2 className={styles.resultsTitle}>
              Appuntamenti trovati · {visibleRows.length}
              {selected.length > 0 && <span className={styles.selectedCount}>{selected.length} selezionati</span>}
            </h2>
            <div className={styles.toolbarActions}>
              <Combobox
                className={styles.bulkCombo}
                options={bulkRdlcOptions}
                value=""
                onChange={bulkAssignRdlc}
                disabled={selected.length === 0}
                placeholder="Assegna RDLC a selezionati..."
                aria-label="Assegna RDLC a selezionati"
              />
              <Combobox
                className={styles.bulkCombo}
                options={operatoreOptionsWithNone}
                value=""
                onChange={bulkAssignOperatore}
                disabled={selected.length === 0}
                placeholder="Assegna Operatore a selezionati..."
                aria-label="Assegna Operatore a selezionati"
              />
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCol}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      aria-label={allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
                    />
                  </th>
                  <th>Protocollo</th>
                  <th>Data</th>
                  <th>Fascia</th>
                  <th>Stato</th>
                  <th>Nuovo RDLC</th>
                  <th>Nuovo Operatore</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const key = rowKey(row);
                  // "Handled" (row turns green) once either role has ever been applied; the
                  // Assegna button only re-enables while a combobox shows something other
                  // than what was actually applied to it.
                  const appliedRdlc = appliedRdlcFor.get(key);
                  const appliedOperatore = appliedOperatoreFor.get(key);
                  const isHandled = appliedRdlc !== undefined || appliedOperatore !== undefined;
                  const rdlcPending = !!rowRdlc[key] && rowRdlc[key] !== appliedRdlc;
                  const operatorePending =
                    (rowOperatore[key] ?? '') !== (appliedOperatore ?? row.currentOperatore);
                  const hasPending = rdlcPending || operatorePending;
                  return (
                    <tr key={key} className={isHandled ? styles.rowHandled : undefined}>
                      <td className={styles.checkCol}>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={() =>
                            setSelected((s) => (s.includes(key) ? s.filter((i) => i !== key) : [...s, key]))
                          }
                          aria-label={`Seleziona ${row.protocollo}`}
                        />
                      </td>
                      <td className={styles.protocollo}>{row.protocollo}</td>
                      <td>{row.data}</td>
                      <td>{formatSlotRange(row.slot)}</td>
                      <td>
                        <StatusPill status={row.stato} level="appointment" />
                      </td>
                      <td>
                        <Combobox
                          className={styles.rowCombo}
                          options={rdlcOptionsForRow(row.protocollo)}
                          value={rowRdlc[key] ?? ''}
                          onChange={(v) => setRowRdlc((r) => ({ ...r, [key]: v }))}
                          placeholder="Seleziona RDLC"
                        />
                      </td>
                      <td>
                        <Combobox
                          className={styles.rowCombo}
                          options={operatoreOptionsWithNone}
                          value={rowOperatore[key] ?? ''}
                          onChange={(v) => setRowOperatore((r) => ({ ...r, [key]: v }))}
                          placeholder={NESSUN_OPERATORE}
                        />
                      </td>
                      <td>
                        <Button variant="success" disabled={!hasPending} onClick={() => assignRow(row)}>
                          <CheckCircle size={14} weight="bold" />
                          {isHandled && !hasPending ? 'Assegnato' : 'Assegna'}
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
