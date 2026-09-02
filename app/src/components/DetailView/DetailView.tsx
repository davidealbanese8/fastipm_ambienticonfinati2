import { useMemo, useState } from 'react';
import { CaretDown, CaretLeft, CaretUp, ChatText, Check, Plus, Trash } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { StatusPill } from '../common/StatusPill';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { DatePickerPopover } from '../common/DatePickerPopover';
import { RdlcDrawer } from '../common/RdlcDrawer';
import {
  allApptConfermato,
  anyApptDaConfermare,
  anyApptDaRimodulare,
  isRealizzazioneOwner,
  isSicurezzaOwner,
} from '../../logic/rules';
import type { Appointment, FasciaOraria } from '../../types';
import styles from './DetailView.module.css';

type ModalKind =
  | { kind: 'realizzazione-rimodula'; apptId: number }
  | { kind: 'rimodula'; apptId: number }
  | { kind: 'rimodula-rc' }
  | { kind: 'delete-appt'; apptId: number }
  | null;

export function DetailView() {
  const { role, currentProtocollo, tasks, selectedApptIds, operators } = useAppState();
  const dispatch = useAppDispatch();
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [cameretta, setCameretta] = useState('');
  const [data, setData] = useState('');
  const [fascia, setFascia] = useState<FasciaOraria>('09:00 - 13:00');
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalData, setModalData] = useState('');
  const [modalFascia, setModalFascia] = useState<FasciaOraria>('09:00 - 13:00');
  const [rimodulaNote, setRimodulaNote] = useState('');
  const [rdlcDrawerApptId, setRdlcDrawerApptId] = useState<number | null>(null);

  const task = currentProtocollo ? tasks[currentProtocollo] : null;

  const isOwner = useMemo(() => {
    if (!task) return false;
    return role === 'realizzazione' ? isRealizzazioneOwner(task) : isSicurezzaOwner(task);
  }, [task, role]);

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
    setModalFascia('09:00 - 13:00');
    setRimodulaNote('');
  }

  function submitModal() {
    if (!task || !modal) return;
    if (modal.kind === 'realizzazione-rimodula') {
      dispatch({
        type: 'REALIZZAZIONE_RIMODULA_APPT',
        protocollo: task.protocollo,
        apptId: modal.apptId,
        data: modalData,
        fascia: modalFascia,
      });
    } else if (modal.kind === 'rimodula') {
      dispatch({ type: 'RIMODULA_APPT', protocollo: task.protocollo, apptId: modal.apptId, data: modalData, fascia: modalFascia });
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
    if (!task || !cameretta || !data || !fascia) return;
    dispatch({ type: 'ADD_APPOINTMENT', protocollo: task.protocollo, cameretta, data, fascia });
    setCameretta('');
    setData('');
    setFascia('09:00 - 13:00');
    setNewApptOpen(false);
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
            {task.pendingSicurezzaNote && <span className={styles.badge} />}
          </button>

          <div className={styles.headerActions}>
            {role === 'realizzazione' ? (
              <>
                <Button variant="neutral" onClick={() => dispatch({ type: 'SHOW_TOAST', message: 'Salvato.' })}>
                  Salva
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
                      variant="rdlc"
                      disabled={!isOwner}
                      onClick={() => dispatch({ type: 'RIAPPUNTAMENTA', protocollo: task.protocollo })}
                    >
                      Riappuntamenta
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="rdlc"
                    disabled={!isOwner}
                    onClick={() => dispatch({ type: 'APPUNTAMENTA', protocollo: task.protocollo })}
                  >
                    Appuntamenta
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
          <button className={styles.newApptHeader} onClick={() => setNewApptOpen((v) => !v)}>
            <span>
              <Plus size={16} /> Nuovo appuntamento
            </span>
            {newApptOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
          </button>
          {newApptOpen && (
            <div className={styles.newApptForm}>
              <label className={styles.formField}>
                <span>Cameretta</span>
                <input value={cameretta} onChange={(e) => setCameretta(e.target.value)} placeholder="Es. Cameretta A1" />
              </label>
              <DatePickerPopover label="Data appuntamento" value={data} onChange={setData} id="new-appt-date" />
              <div className={styles.formField}>
                <span>Fascia oraria</span>
                <div className={styles.fasciaToggle}>
                  {(['09:00 - 13:00', '14:00 - 18:00'] as FasciaOraria[]).map((f) => (
                    <button
                      key={f}
                      className={fascia === f ? styles.fasciaActive : ''}
                      onClick={() => setFascia(f)}
                      type="button"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" onClick={submitNewAppt} disabled={!cameretta || !data}>
                Aggiungi
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={styles.apptSection}>
        <div className={styles.apptSectionHeader}>
          <h2>Appuntamenti</h2>
          {selectedApptIds.length > 0 && (
            <div className={styles.bulkToolbar}>
              <span>{selectedApptIds.length} selezionati</span>
              {role === 'sicurezza' ? (
                <>
                  <Button
                    variant="success"
                    onClick={() => {
                      for (const id of selectedApptIds) dispatch({ type: 'CONFIRM_APPT', protocollo: task.protocollo, apptId: id });
                      dispatch({ type: 'CLEAR_SELECTION' });
                    }}
                  >
                    Conferma selezionati
                  </Button>
                </>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => {
                    for (const id of selectedApptIds) dispatch({ type: 'DELETE_APPOINTMENT', protocollo: task.protocollo, apptId: id });
                  }}
                >
                  <Trash size={14} /> Elimina selezionati
                </Button>
              )}
            </div>
          )}
        </div>

        {task.appointments.length === 0 ? (
          <div className={styles.empty}>Nessun appuntamento presente per questo task.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Cameretta</th>
                  <th>Data pianificazione</th>
                  <th>Fascia oraria</th>
                  <th>Stato</th>
                  <th>RDLC</th>
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
                    selected={selectedApptIds.includes(appt.id)}
                    onToggle={() => toggleSelect(appt.id)}
                    onConfirmSicurezza={() => dispatch({ type: 'CONFIRM_APPT', protocollo: task.protocollo, apptId: appt.id })}
                    onOpenRimodula={() => {
                      setModal({ kind: 'rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalFascia(appt.fasciaOraria);
                    }}
                    onConfermaProposta={() => dispatch({ type: 'CONFERMA_PROPOSTA', protocollo: task.protocollo, apptId: appt.id })}
                    onOpenRealizzazioneRimodula={() => {
                      setModal({ kind: 'realizzazione-rimodula', apptId: appt.id });
                      setModalData(appt.dataPianificazione);
                      setModalFascia(appt.fasciaOraria);
                    }}
                    onDelete={() => setModal({ kind: 'delete-appt', apptId: appt.id })}
                    onOpenRdlc={() => setRdlcDrawerApptId(appt.id)}
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

      {(modal?.kind === 'rimodula' || modal?.kind === 'realizzazione-rimodula') && (
        <Modal
          title={modal.kind === 'rimodula' ? 'Proponi rimodulazione' : 'Controproponi data'}
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
            <DatePickerPopover label="Nuova data" value={modalData} onChange={setModalData} id="modal-date" />
            <div className={styles.formField}>
              <span>Fascia oraria</span>
              <div className={styles.fasciaToggle}>
                {(['09:00 - 13:00', '14:00 - 18:00'] as FasciaOraria[]).map((f) => (
                  <button key={f} className={modalFascia === f ? styles.fasciaActive : ''} onClick={() => setModalFascia(f)} type="button">
                    {f}
                  </button>
                ))}
              </div>
            </div>
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
          operators={operators.filter((o) => o.area === task.areaFw)}
          currentOperatorName={task.appointments.find((a) => a.id === rdlcDrawerApptId)?.rdlc ?? ''}
          onClose={() => setRdlcDrawerApptId(null)}
          onAssign={(operatorName, day, fascia) => {
            dispatch({
              type: 'ASSIGN_RDLC',
              protocollo: task.protocollo,
              apptIds: [rdlcDrawerApptId],
              operatorName,
              day,
              fascia,
            });
            setRdlcDrawerApptId(null);
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
}) {
  return (
    <tr>
      <td>
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label="Seleziona riga" />
      </td>
      <td>{appt.cameretta}</td>
      <td>{appt.dataPianificazione}</td>
      <td>{appt.fasciaOraria}</td>
      <td>
        <StatusPill status={appt.stato} level="appointment" />
      </td>
      <td>{appt.rdlc || '—'}</td>
      <td>
        <div className={styles.rowActions}>
          {role === 'sicurezza' && (
            <>
              <Button variant="rdlc" disabled={!isOwner} onClick={onOpenRdlc}>
                RDLC
              </Button>
              <Button variant="success" disabled={!isOwner || !appt.rdlc} onClick={onConfirmSicurezza}>
                Conferma
              </Button>
              <Button variant="rimodula" disabled={!isOwner || !appt.rdlc} onClick={onOpenRimodula}>
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
