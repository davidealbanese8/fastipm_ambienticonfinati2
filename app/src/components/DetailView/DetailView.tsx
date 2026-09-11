import { useMemo, useState } from 'react';
import { CalendarBlank, CaretDown, CaretLeft, CaretUp, ChatText, Check, Plus, Trash } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { StatusPill } from '../common/StatusPill';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { RdlcDrawer } from '../common/RdlcDrawer';
import { Combobox, type ComboboxOption } from '../common/Combobox';
import { SlotPicker } from '../common/SlotPicker';
import {
  allApptConfermato,
  anyApptDaConfermare,
  anyApptDaRimodulare,
  isRealizzazioneOwner,
  isSicurezzaOwner,
  isRemoto,
} from '../../logic/rules';
import { ALL_SLOTS, formatSlotRange } from '../../logic/timeSlots';
import {
  OPERATORE_NAMES,
  operatoreOptionsWithCounts,
  operatorOptionsWithCounts,
  suggestOperatorForSlot,
} from '../../logic/operators';
import type { Appointment, TimeSlot } from '../../types';
import styles from './DetailView.module.css';

type ModalKind =
  | { kind: 'confirm-appt'; apptId: number }
  | { kind: 'realizzazione-rimodula'; apptId: number }
  | { kind: 'realizzazione-rimodula-bulk'; apptIds: number[] }
  | { kind: 'rimodula'; apptId: number }
  | { kind: 'rimodula-bulk'; apptIds: number[] }
  | { kind: 'rimodula-rc' }
  | { kind: 'delete-appt'; apptId: number }
  | null;

export function DetailView() {
  const { role, currentProtocollo, tasks, selectedApptIds, operators } = useAppState();
  const dispatch = useAppDispatch();
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [cameretta, setCameretta] = useState('');
  const [data, setData] = useState('');
  const [slot, setSlot] = useState<TimeSlot>(ALL_SLOTS[0]);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalData, setModalData] = useState('');
  const [modalSlot, setModalSlot] = useState<TimeSlot>(ALL_SLOTS[0]);
  const [modalOperatore, setModalOperatore] = useState('');
  const [rimodulaNote, setRimodulaNote] = useState('');
  const [rdlcDrawerApptId, setRdlcDrawerApptId] = useState<number | null>(null);
  const [bulkRdlcDrawerOpen, setBulkRdlcDrawerOpen] = useState(false);
  const [operatoreDrawerApptId, setOperatoreDrawerApptId] = useState<number | null>(null);

  const task = currentProtocollo ? tasks[currentProtocollo] : null;

  const isOwner = useMemo(() => {
    if (!task) return false;
    return role === 'realizzazione' ? isRealizzazioneOwner(task) : isSicurezzaOwner(task);
  }, [task, role]);

  // RDLC is scoped to the RC's own area (max 5 names per area); Operatore is a separate,
  // area-independent fixed pool (max 5 names total). Every option carries a `detail`
  // (confirmed/pending counts) shown only while the dropdown is open.
  const allTasksList = useMemo(() => Object.values(tasks), [tasks]);
  const rdlcOperators = useMemo(
    () => operators.filter((o) => o.area === task?.areaFw),
    [operators, task?.areaFw]
  );
  const operatorOptionsForTask: ComboboxOption[] = useMemo(
    () => operatorOptionsWithCounts(rdlcOperators, allTasksList),
    [rdlcOperators, allTasksList]
  );
  const operatoreOptions: ComboboxOption[] = useMemo(() => operatoreOptionsWithCounts(allTasksList), [allTasksList]);
  const modalOperatoreOptions: ComboboxOption[] = useMemo(
    () => [{ value: '', label: 'Nessuno — in presenza' }, ...operatoreOptions],
    [operatoreOptions]
  );

  if (!task) {
    return (
      <div>
        <p>Task non trovato.</p>
        <Button onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })}>Torna alla lista</Button>
      </div>
    );
  }

  const sicurezzaBlocked = role === 'sicurezza' && anyApptDaConfermare(task);

  function closeModal() {
    setModal(null);
    setModalData('');
    setModalSlot(ALL_SLOTS[0]);
    setModalOperatore('');
    setRimodulaNote('');
  }

  function submitModal() {
    if (!task || !modal) return;
    if (modal.kind === 'confirm-appt') {
      dispatch({ type: 'CONFIRM_APPT', protocollo: task.protocollo, apptId: modal.apptId, operatore: modalOperatore });
    } else if (modal.kind === 'realizzazione-rimodula') {
      dispatch({
        type: 'REALIZZAZIONE_RIMODULA_APPT',
        protocollo: task.protocollo,
        apptId: modal.apptId,
        data: modalData,
        slot: modalSlot,
      });
    } else if (modal.kind === 'rimodula') {
      dispatch({
        type: 'RIMODULA_APPT',
        protocollo: task.protocollo,
        apptId: modal.apptId,
        data: modalData,
        slot: modalSlot,
        operatore: modalOperatore,
      });
    } else if (modal.kind === 'rimodula-bulk') {
      dispatch({
        type: 'RIMODULA_APPTS_BULK',
        protocollo: task.protocollo,
        apptIds: modal.apptIds,
        data: modalData,
        slot: modalSlot,
        operatore: modalOperatore,
      });
    } else if (modal.kind === 'realizzazione-rimodula-bulk') {
      dispatch({
        type: 'REALIZZAZIONE_RIMODULA_APPTS_BULK',
        protocollo: task.protocollo,
        apptIds: modal.apptIds,
        data: modalData,
        slot: modalSlot,
      });
    } else if (modal.kind === 'rimodula-rc') {
      dispatch({ type: 'RIMODULA_RC', protocollo: task.protocollo, note: rimodulaNote });
    } else if (modal.kind === 'delete-appt') {
      dispatch({ type: 'DELETE_APPOINTMENT', protocollo: task.protocollo, apptId: modal.apptId });
    }
    closeModal();
  }

  function toggleSelect(id: number) {
    dispatch({ type: 'TOGGLE_APPT_SELECTION', id });
  }

  function submitNewAppt() {
    if (!task || !cameretta || !data || !slot) return;
    dispatch({ type: 'ADD_APPOINTMENT', protocollo: task.protocollo, cameretta, data, slot });
    setCameretta('');
    setData('');
    setSlot(ALL_SLOTS[0]);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <button className={styles.backBtn} onClick={() => dispatch({ type: 'NAVIGATE', view: 'list' })} aria-label="Indietro">
            <CaretLeft size={18} />
          </button>
          <span className={styles.protocollo}>{task.protocollo}</span>
          <StatusPill status={task.stato} level="rc" />
          <button
            className={styles.notesBtn}
            onClick={() => dispatch({ type: 'OPEN_NOTES', protocollo: task.protocollo })}
            aria-label="Note"
            title="Storico note"
          >
            <ChatText size={18} />
            {task.notes.length > 0 && task.pendingSicurezzaNote && <span className={styles.badge} />}
          </button>

          <div className={styles.headerActions}>
            {role === 'realizzazione' ? (
              <>
                <Button variant="success" onClick={() => dispatch({ type: 'SHOW_TOAST', message: 'Salvato.' })}>
                  <Check size={14} /> Salva
                </Button>
                {task.stato === 'Da Rimodulare' ? (
                  <>
                    <Button
                      variant="success"
                      disabled={!isOwner}
                      onClick={() => dispatch({ type: 'CONFIRM_REALIZZAZIONE', protocollo: task.protocollo })}
                    >
                      <Check size={14} /> Conferma
                    </Button>
                    <Button
                      variant="warning"
                      disabled={!isOwner}
                      onClick={() => dispatch({ type: 'RIAPPUNTAMENTA', protocollo: task.protocollo })}
                    >
                      <CalendarBlank size={14} /> Riappuntamenta
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="warning"
                    disabled={!isOwner}
                    onClick={() => dispatch({ type: 'APPUNTAMENTA', protocollo: task.protocollo })}
                  >
                    <CalendarBlank size={14} /> Appuntamenta
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="success"
                  disabled={!isOwner || sicurezzaBlocked}
                  onClick={() => dispatch({ type: 'CONFIRM_RC', protocollo: task.protocollo })}
                >
                  <Check size={14} /> Conferma
                </Button>
                <Button
                  variant="rimodula"
                  disabled={!isOwner || sicurezzaBlocked}
                  onClick={() => setModal({ kind: 'rimodula-rc' })}
                >
                  Rimodula
                </Button>
              </>
            )}
            <button className={styles.accordionToggle} onClick={() => setAccordionOpen((v) => !v)} aria-label="Espandi dettagli">
              {accordionOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
            </button>
          </div>
        </div>

        {!isOwner && <div className={styles.ownerNote}>Task non di competenza in questo stato.</div>}

        {accordionOpen && (
          <div className={styles.grid}>
            <Field label="Last Update" value={task.lastUpdate} />
            <Field label="System Realizzazione" value={task.systemRealizzazione} />
            <Field label="System Sicurezza" value={task.systemSicurezza} />
            <Field label="Cliente" value={task.cliente} />
            <Field label="Città" value={task.citta} />
            <Field label="Provincia" value={task.provincia} />
            <Field label="Regione" value={task.regione} />
            <Field label="Area FW" value={task.areaFw} />
          </div>
        )}
      </div>

      {role === 'realizzazione' && (
        <div className={styles.newApptCard}>
          <span className={styles.newApptTitle}>Nuovo appuntamento</span>
          <div className={styles.newApptFields}>
            <label className={styles.formField}>
              <span>Cameretta</span>
              <input value={cameretta} onChange={(e) => setCameretta(e.target.value)} placeholder="Es. Cameretta A1" />
            </label>
            <DatePickerPopover label="Data appuntamento" value={data} onChange={setData} id="new-appt-date" />
            <div className={styles.formField}>
              <span>Slot orario</span>
              <SlotPicker value={slot} onChange={setSlot} />
            </div>
            <Button variant="warning" onClick={submitNewAppt} disabled={!cameretta || !data}>
              <Plus size={14} /> Aggiungi
            </Button>
          </div>
        </div>
      )}

      <div className={styles.apptSection}>
        <div className={styles.apptSectionHeader}>
          <h2>Appuntamenti</h2>
          {role === 'sicurezza' ? (
            <div className={styles.bulkToolbar}>
              {selectedApptIds.length > 0 && <span>{selectedApptIds.length} selezionati</span>}
              <Combobox
                options={operatorOptionsForTask}
                value=""
                placeholder="Assegna RDLC a selezionati..."
                disabled={selectedApptIds.length === 0}
                onChange={(operatorName) => {
                  if (!operatorName) return;
                  for (const id of selectedApptIds) {
                    const appt = task.appointments.find((a) => a.id === id);
                    if (!appt) continue;
                    dispatch({
                      type: 'ASSIGN_RDLC',
                      protocollo: task.protocollo,
                      apptIds: [id],
                      operatorName,
                      day: appt.dataPianificazione,
                      slot: appt.slot,
                    });
                  }
                }}
              />
              <Combobox
                options={modalOperatoreOptions}
                value=""
                placeholder="Assegna Operatore a selezionati..."
                disabled={selectedApptIds.length === 0}
                onChange={(operatore) => {
                  for (const id of selectedApptIds) {
                    dispatch({ type: 'REASSIGN_REMOTE_OPERATOR', protocollo: task.protocollo, apptId: id, operatore });
                  }
                }}
              />
              <Button
                variant="success"
                disabled={selectedApptIds.length === 0}
                onClick={() => dispatch({ type: 'CONFIRM_APPTS_BULK', protocollo: task.protocollo, apptIds: selectedApptIds })}
              >
                <Check size={14} /> Conferma
              </Button>
              <Button
                variant="rimodula"
                disabled={selectedApptIds.length === 0}
                onClick={() => {
                  const first = task.appointments.find((a) => a.id === selectedApptIds[0]);
                  setModal({ kind: 'rimodula-bulk', apptIds: selectedApptIds });
                  setModalData(first?.dataPianificazione ?? '');
                  setModalSlot(first?.slot ?? ALL_SLOTS[0]);
                  setModalOperatore(first?.operatore ?? '');
                }}
              >
                Rimodula
              </Button>
              <Button variant="rdlc" disabled={selectedApptIds.length === 0} onClick={() => setBulkRdlcDrawerOpen(true)}>
                Disponibilità RDLC
              </Button>
            </div>
          ) : (
            selectedApptIds.length > 0 && (
              <div className={styles.bulkToolbar}>
                <span>{selectedApptIds.length} selezionati</span>
                <Button
                  variant="success"
                  onClick={() => dispatch({ type: 'CONFERMA_PROPOSTA_BULK', protocollo: task.protocollo, apptIds: selectedApptIds })}
                >
                  <Check size={14} /> Conferma proposta
                </Button>
                <Button
                  variant="rimodula"
                  onClick={() => {
                    const first = task.appointments.find((a) => a.id === selectedApptIds[0]);
                    setModal({ kind: 'realizzazione-rimodula-bulk', apptIds: selectedApptIds });
                    setModalData(first?.dataPianificazione ?? '');
                    setModalSlot(first?.slot ?? ALL_SLOTS[0]);
                  }}
                >
                  Rimodula
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    for (const id of selectedApptIds) dispatch({ type: 'DELETE_APPOINTMENT', protocollo: task.protocollo, apptId: id });
                  }}
                >
                  <Trash size={14} /> Elimina selezionati
                </Button>
              </div>
            )
          )}
        </div>

        {task.appointments.length === 0 ? (
          <div className={styles.empty}>Nessun appuntamento presente per questo task.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutti"
                      checked={selectedApptIds.length > 0 && selectedApptIds.length === task.appointments.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedApptIds.length > 0 && selectedApptIds.length < task.appointments.length;
                      }}
                      onChange={(e) =>
                        dispatch({ type: 'SET_SELECTION', ids: e.target.checked ? task.appointments.map((a) => a.id) : [] })
                      }
                    />
                  </th>
                  <th>ID Cameretta</th>
                  <th>Data pianificazione</th>
                  <th>Slot</th>
                  <th>Stato</th>
                  <th>Modalità</th>
                  <th>RDLC</th>
                  <th>Operatore</th>
                  <th>Data RDLC</th>
                  <th>Slot RDLC</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {task.appointments.map((appt) => (
                  <ApptRow
                    key={appt.id}
                    appt={appt}
                    role={role}
                    isOwner={isOwner}
                    suggestedRdlc={
                      appt.stato === 'Da Confermare' && !appt.rdlc
                        ? suggestOperatorForSlot(task.areaFw, appt.slot, rdlcOperators, allTasksList)?.name
                        : undefined
                    }
                    selected={selectedApptIds.includes(appt.id)}
                    onToggle={() => toggleSelect(appt.id)}
                    onConfirmSicurezza={() => setModal({ kind: 'confirm-appt', apptId: appt.id })}
                    onOpenRimodula={() => {
                      setModal({ kind: 'rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalSlot(appt.slot);
                      setModalOperatore(appt.operatore);
                    }}
                    onConfermaProposta={() => dispatch({ type: 'CONFERMA_PROPOSTA', protocollo: task.protocollo, apptId: appt.id })}
                    onOpenRealizzazioneRimodula={() => {
                      setModal({ kind: 'realizzazione-rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalSlot(appt.slot);
                    }}
                    onDelete={() => setModal({ kind: 'delete-appt', apptId: appt.id })}
                    onOpenRdlc={() => setRdlcDrawerApptId(appt.id)}
                    onOpenOperatoreDrawer={() => setOperatoreDrawerApptId(appt.id)}
                    operatorOptions={operatorOptionsForTask}
                    operatorOptionsWithNone={modalOperatoreOptions}
                    onQuickAssignRdlc={(operatorName) =>
                      dispatch({
                        type: 'ASSIGN_RDLC',
                        protocollo: task.protocollo,
                        apptIds: [appt.id],
                        operatorName,
                        day: appt.dataPianificazione,
                        slot: appt.slot,
                      })
                    }
                    onQuickAssignOperatore={(operatore) =>
                      dispatch({ type: 'REASSIGN_REMOTE_OPERATOR', protocollo: task.protocollo, apptId: appt.id, operatore })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.kind === 'delete-appt' && (
        <Modal
          title="Elimina appuntamento"
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button style={{ background: '#dc2626', color: '#fff' }} onClick={submitModal}>
                Elimina
              </Button>
            </>
          }
        >
          <p>Sei sicuro di voler eliminare questo appuntamento? L'azione non è reversibile.</p>
        </Modal>
      )}

      {modal?.kind === 'confirm-appt' && (
        <Modal
          title="Conferma appuntamento"
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button variant="success" onClick={submitModal}>
                Conferma
              </Button>
            </>
          }
        >
          <div className={styles.modalForm}>
            <label className={styles.formField}>
              <span>Operatore (per appuntamento da remoto)</span>
              <Combobox options={modalOperatoreOptions} value={modalOperatore} onChange={setModalOperatore} placeholder="Nessuno — in presenza" />
            </label>
          </div>
        </Modal>
      )}

      {(modal?.kind === 'rimodula' ||
        modal?.kind === 'rimodula-bulk' ||
        modal?.kind === 'realizzazione-rimodula' ||
        modal?.kind === 'realizzazione-rimodula-bulk') && (
        <Modal
          title={
            modal.kind === 'rimodula' || modal.kind === 'rimodula-bulk' ? 'Proponi rimodulazione' : 'Controproponi data'
          }
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button variant="rimodula" onClick={submitModal} disabled={!modalData}>
                Invia
              </Button>
            </>
          }
        >
          <div className={styles.modalForm}>
            {(modal.kind === 'rimodula-bulk' || modal.kind === 'realizzazione-rimodula-bulk') && (
              <p className={styles.modalitaTag}>{modal.apptIds.length} appuntamenti selezionati</p>
            )}
            <DatePickerPopover label="Nuova data" value={modalData} onChange={setModalData} id="modal-date" />
            <label className={styles.formField}>
              <span>Slot orario</span>
              <SlotPicker value={modalSlot} onChange={setModalSlot} />
            </label>
            {(modal.kind === 'rimodula' || modal.kind === 'rimodula-bulk') && (
              <label className={styles.formField}>
                <span>Operatore (per appuntamento da remoto)</span>
                <Combobox options={modalOperatoreOptions} value={modalOperatore} onChange={setModalOperatore} placeholder="Nessuno — in presenza" />
              </label>
            )}
          </div>
        </Modal>
      )}

      {modal?.kind === 'rimodula-rc' && (
        <Modal
          title="Rimodula task"
          onClose={closeModal}
          footer={
            <>
              <Button variant="neutral" onClick={closeModal}>
                Annulla
              </Button>
              <Button variant="rimodula" onClick={submitModal}>
                Conferma rimodulazione
              </Button>
            </>
          }
        >
          <label className={styles.formField}>
            <span>Nota (opzionale)</span>
            <textarea value={rimodulaNote} onChange={(e) => setRimodulaNote(e.target.value)} rows={3} />
          </label>
        </Modal>
      )}

      {rdlcDrawerApptId !== null && (
        <RdlcDrawer
          operators={rdlcOperators}
          currentOperatorName={task.appointments.find((a) => a.id === rdlcDrawerApptId)?.rdlc ?? ''}
          cameretta={task.appointments.find((a) => a.id === rdlcDrawerApptId)?.cameretta}
          targetDay={task.appointments.find((a) => a.id === rdlcDrawerApptId)?.dataPianificazione}
          onClose={() => setRdlcDrawerApptId(null)}
          onAssign={(operatorName, day, slot) => {
            dispatch({
              type: 'ASSIGN_RDLC',
              protocollo: task.protocollo,
              apptIds: [rdlcDrawerApptId],
              operatorName,
              day,
              slot,
            });
            setRdlcDrawerApptId(null);
          }}
        />
      )}

      {bulkRdlcDrawerOpen && (
        <RdlcDrawer
          operators={rdlcOperators}
          currentOperatorName=""
          onClose={() => setBulkRdlcDrawerOpen(false)}
          onAssign={(operatorName, day, slot) => {
            dispatch({
              type: 'ASSIGN_RDLC',
              protocollo: task.protocollo,
              apptIds: selectedApptIds,
              operatorName,
              day,
              slot,
            });
            setBulkRdlcDrawerOpen(false);
            dispatch({ type: 'CLEAR_SELECTION' });
          }}
        />
      )}

      {operatoreDrawerApptId !== null && (
        <RdlcDrawer
          operators={OPERATORE_NAMES.map((name) => ({ name, area: task.areaFw }))}
          currentOperatorName={task.appointments.find((a) => a.id === operatoreDrawerApptId)?.operatore ?? ''}
          cameretta={task.appointments.find((a) => a.id === operatoreDrawerApptId)?.cameretta}
          targetDay={task.appointments.find((a) => a.id === operatoreDrawerApptId)?.dataPianificazione}
          onClose={() => setOperatoreDrawerApptId(null)}
          onAssign={(operatorName) => {
            dispatch({
              type: 'REASSIGN_REMOTE_OPERATOR',
              protocollo: task.protocollo,
              apptId: operatoreDrawerApptId,
              operatore: operatorName,
            });
            setOperatoreDrawerApptId(null);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}

function ApptRow({
  appt,
  role,
  isOwner,
  selected,
  onToggle,
  onConfirmSicurezza,
  onOpenRimodula,
  onConfermaProposta,
  onOpenRealizzazioneRimodula,
  onDelete,
  onOpenRdlc,
  onOpenOperatoreDrawer,
  operatorOptions,
  operatorOptionsWithNone,
  suggestedRdlc,
  onQuickAssignRdlc,
  onQuickAssignOperatore,
}: {
  appt: Appointment;
  role: 'realizzazione' | 'sicurezza';
  isOwner: boolean;
  selected: boolean;
  onToggle: () => void;
  onConfirmSicurezza: () => void;
  onOpenRimodula: () => void;
  onConfermaProposta: () => void;
  onOpenRealizzazioneRimodula: () => void;
  onDelete: () => void;
  onOpenRdlc: () => void;
  onOpenOperatoreDrawer: () => void;
  operatorOptions: ComboboxOption[];
  operatorOptionsWithNone: ComboboxOption[];
  suggestedRdlc?: string;
  onQuickAssignRdlc: (operatorName: string) => void;
  onQuickAssignOperatore: (operatore: string) => void;
}) {
  // Once an appointment is "Appuntamentato" (stato Confermato), Sicurezza can no longer
  // touch that row — only Realizzazione may still edit it.
  const sicurezzaLocked = role === 'sicurezza' && appt.stato === 'Confermato';
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={sicurezzaLocked}
          aria-label="Seleziona riga"
        />
      </td>
      <td>{appt.cameretta}</td>
      <td>{appt.dataPianificazione}</td>
      <td>{formatSlotRange(appt.slot)}</td>
      <td>
        <StatusPill status={appt.stato} level="appointment" />
      </td>
      <td>
        <span className={styles.modalitaTag}>{isRemoto(appt) ? 'Da remoto' : 'In presenza'}</span>
      </td>
      <td>
        {role === 'sicurezza' ? (
          <div className={styles.rdlcCell}>
            <Combobox
              options={operatorOptions}
              value={appt.rdlc}
              disabled={!isOwner || sicurezzaLocked}
              onChange={(v) => v && onQuickAssignRdlc(v)}
              placeholder={suggestedRdlc ? `Suggerito: ${suggestedRdlc}` : 'Seleziona op'}
            />
            <button
              className={styles.rdlcCalendarBtn}
              disabled={!isOwner || sicurezzaLocked}
              onClick={onOpenRdlc}
              aria-label="Disponibilità RDLC"
              type="button"
            >
              <CalendarBlank size={14} />
            </button>
          </div>
        ) : (
          appt.rdlc || '—'
        )}
      </td>
      <td>
        {role === 'sicurezza' ? (
          <div className={styles.rdlcCell}>
            <Combobox
              options={operatorOptionsWithNone}
              value={appt.operatore}
              disabled={!isOwner || sicurezzaLocked}
              onChange={onQuickAssignOperatore}
              placeholder="Nessuno — in presenza"
            />
            <button
              className={styles.rdlcCalendarBtn}
              disabled={!isOwner || sicurezzaLocked}
              onClick={onOpenOperatoreDrawer}
              aria-label="Disponibilità operatore"
              type="button"
            >
              <CalendarBlank size={14} />
            </button>
          </div>
        ) : (
          appt.operatore || '—'
        )}
      </td>
      <td>{appt.dataRdlc || '—'}</td>
      <td>{appt.slotRdlc ? formatSlotRange(appt.slotRdlc) : '—'}</td>
      <td>
        <div className={styles.rowActions}>
          {role === 'sicurezza' && (
            <>
              <Button variant="success" disabled={!isOwner || !appt.rdlc || sicurezzaLocked} onClick={onConfirmSicurezza}>
                Conferma
              </Button>
              <Button variant="rimodula" disabled={!isOwner || !appt.rdlc || sicurezzaLocked} onClick={onOpenRimodula}>
                Rimodula
              </Button>
            </>
          )}
          {role === 'realizzazione' && (
            <>
              {appt.stato === 'Da Rimodulare' && (
                <Button variant="success" disabled={!isOwner} onClick={onConfermaProposta}>
                  Conferma
                </Button>
              )}
              <Button variant="rimodula" disabled={!isOwner} onClick={onOpenRealizzazioneRimodula}>
                Rimodula
              </Button>
              <Button variant="danger" disabled={!isOwner} onClick={onDelete}>
                <Trash size={13} />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// re-export for tests / potential reuse
export { allApptConfermato, anyApptDaRimodulare };
