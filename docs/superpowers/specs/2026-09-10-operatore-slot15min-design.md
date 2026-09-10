# Design: slot da 15 minuti, colonna Operatore, appuntamento da remoto

Data: 2026-09-10

## Contesto

Oggi (`app/src/types.ts`) ogni `Appointment` usa una `FasciaOraria` a due
soli valori (`'09:00 - 13:00' | '14:00 - 18:00'`), duplicata come costante
`FASCE` in tre file (`mockData.ts`, `RdlcDrawer.tsx`,
`CalendarioGlobaleView.tsx`). Il campo `rdlc: string` rappresenta il
responsabile assegnato all'appuntamento (nome preso dal pool
`operators.ts`, filtrato per `AreaFw`); non esiste un concetto separato di
"operatore per il remoto", né uno stato di modalità presenza/remoto.

Questo documento sostituisce le fasce orarie con slot da 15 minuti e
introduce un secondo assegnatario opzionale, l'Operatore, che abilita
l'esecuzione da remoto dell'appuntamento.

## Obiettivi

1. Sostituire le 2 fasce fisse con slot da 15 minuti, stesso orario
   complessivo (09:00–13:00, 14:00–18:00 → 32 slot/giorno).
2. Aggiungere una colonna "Operatore" subito a destra di "RDLC" nelle
   viste che mostrano gli appuntamenti.
3. Regola di business: RDLC da solo → appuntamento in presenza; RDLC +
   Operatore → appuntamento da remoto. La modalità non è un campo
   salvato: si deriva dalla presenza del campo `operatore`.
4. L'Operatore è selezionabile da Sicurezza nell'azione di conferma o
   rimodulazione di un appuntamento, ed è anche riassegnabile/rimovibile
   da `RiassegnaView`, simmetricamente a RDLC.
5. Aggiornare `CalendarioGlobaleView` alla nuova granularità: righe =
   operatori (RDLC), colonne = giorno × fascia-ora (8 ore lavorative:
   9,10,11,12,14,15,16,17); ogni appuntamento mostra il proprio slot
   esatto (es. "09:15") dentro la cella-ora, con dettagli (cliente,
   RDLC, Operatore, modalità) al click/hover.
6. Aggiornare `RdlcDrawer` (assegnazione bulk RDLC) alla stessa
   granularità oraria, con scelta dello slot preciso da 15 minuti.
7. Eliminare la duplicazione della costante `FASCE`/slot in un unico
   modulo condiviso.

## Non-obiettivi

- Nessun vincolo di business che limiti il remoto per area/tipo
  intervento: sempre a discrezione di chi conferma.
- Nessun nuovo ruolo/pool separato per l'Operatore: si usa lo stesso
  pool `operators.ts` (Operator{name, area}) già usato per RDLC,
  filtrato per la stessa `AreaFw` del task.
- Nessuna modifica a `ListView` a meno che non esponga oggi campi di
  fascia oraria (da verificare in fase di implementazione).

## Modello dati

`app/src/logic/timeSlots.ts` (nuovo, sostituisce le costanti `FASCE`
duplicate):

```ts
export type TimeSlot = string; // "HH:MM", inizio blocco da 15 minuti

// 09:00 → 12:45 (16 slot) e 14:00 → 17:45 (16 slot) = 32 slot/giorno
export const ALL_SLOTS: TimeSlot[] = [...];

// Le 8 fasce-ora usate come colonne nel calendario e nel drawer
export const WORK_HOURS: number[] = [9, 10, 11, 12, 14, 15, 16, 17];

export function hourOf(slot: TimeSlot): number;
export function slotsInHour(hour: number): TimeSlot[];
export function formatSlotRange(slot: TimeSlot): string; // "09:15–09:30"
```

`app/src/types.ts`:

```ts
// RIMOSSO: export type FasciaOraria = '09:00 - 13:00' | '14:00 - 18:00';

export interface Appointment {
  // ... campi invariati ...
  slot: TimeSlot;            // era: fasciaOraria: FasciaOraria
  slotRdlc: TimeSlot | '';   // era: fasciaOrariaRdlc: FasciaOraria | ''
  operatore: string;         // NUOVO. '' = presenza, valorizzato = remoto
}
```

Nessun campo `modalita` salvato. Helper derivato in `logic/rules.ts` o
`logic/appointments.ts`:

```ts
export function isRemoto(appt: Appointment): boolean {
  return !!appt.operatore;
}
```

## Regole di business (`app/src/logic/rules.ts`)

- `confirmAppt(task, apptId, operatore?: string)`: firma estesa con
  parametro opzionale `operatore`. Se presente, deve appartenere al pool
  `operators.ts` filtrato per `task.areaFw` (stessa validazione già
  applicata a `rdlc`), altrimenti `RuleError`. Se assente, non tocca
  `operatore` (resta `''`, quindi presenza) — ma se un `operatore` era
  già stato impostato in un ciclo precedente e questa chiamata non lo
  ripassa, va comunque resettato a `''` per evitare stato stantio: ogni
  conferma richiede una decisione esplicita sulla modalità.
- `rimodulaAppt(task, apptId, nuovaData, nuovoSlot, operatore?: string)`:
  stessa estensione.
- `assignRdlc` (bulk, invariato nella firma pubblica) continua ad
  assegnare solo RDLC + giorno + slot; non tocca `operatore`.
- `reassignOperator` (RDLC, in `RiassegnaView`, invariato) resta per la
  riassegnazione del RDLC. Quando il RDLC cambia, `operatore` viene
  azzerato (un nuovo RDLC deve poter ridecidere la modalità).
- Nuova funzione `reassignRemoteOperator(task, apptId, operatore: string | '')`:
  riassegna o rimuove (stringa vuota) l'Operatore da `RiassegnaView`,
  simmetrica a `reassignOperator`. Valida l'area come sopra. Non
  richiede che l'appuntamento sia in un particolare stato: può essere
  usata anche per aggiungere il remoto in un secondo momento o
  rimuoverlo tornando in presenza.
- Ogni transizione che riporta l'appuntamento a "Da Confermare" da
  Realizzazione (`confermaProposta`'s counterpart,
  `realizzazioneRimodulaAppt`) azzera `operatore`.

## UI

### DetailView (`app/src/components/DetailView`)

- Tabella appuntamenti: nuova colonna "Operatore" subito dopo "RDLC",
  mostra `appt.operatore || '—'`.
- Colonna fascia oraria rinominata "Slot" (o "Slot orario"), mostra
  `formatSlotRange(appt.slot)` invece del range fascia.
- Modal di conferma/rimodula (Sicurezza): dopo la selezione/validazione
  RDLC esistente, select opzionale "Operatore (per remoto)" — lista
  filtrata per area del task, con opzione vuota "Nessuno (in presenza)".
- Badge derivato "In presenza" / "Da remoto" accanto allo stato riga,
  calcolato con `isRemoto(appt)`.

### RiassegnaView (`app/src/components/RiassegnaView`)

- Colonna "Operatore" aggiunta accanto a "RDLC" nella tabella risultati.
- Azione di riassegnazione/rimozione Operatore simmetrica a quella
  esistente per RDLC, che chiama `reassignRemoteOperator`.

### CalendarioGlobaleView (`app/src/components/CalendarioGlobaleView`)

- Righe: operatori (RDLC), come oggi.
- Colonne: giorno (7) × fascia-ora (8: `WORK_HOURS`), sostituendo le 2
  colonne-fascia attuali → 56 colonne invece di 14.
- Contenuto cella: per ogni appuntamento del RDLC-riga che cade in
  quell'ora (`hourOf(slotEffettivo) === hour`), un chip con l'orario
  slot esatto (es. "09:15"); più chip impilati se più appuntamenti
  cadono nella stessa ora.
- Click/hover sul chip: popover/tooltip con cliente, protocollo, RDLC,
  Operatore (se presente) e modalità (In presenza / Da remoto).
- Slot effettivo = `appt.slotRdlc || appt.slot` (stessa logica di
  precedenza già usata oggi per `fasciaOrariaRdlc || fasciaOraria`).

### RdlcDrawer (`app/src/components/common/RdlcDrawer.tsx`)

- Griglia di assegnazione bulk: oggi giorno × 2 fasce-bottone; diventa
  giorno × 8 ore, ogni cella-ora espande (click o select) alla scelta
  dello slot preciso da 15 minuti (`slotsInHour(hour)`) da assegnare.

### Terminologia

- Tutte le etichette UI "Fascia oraria" → "Slot orario" (o "Slot").

## Mock data (`app/src/logic/mockData.ts`)

- `buildAppointments` genera `slot` scegliendo casualmente da
  `ALL_SLOTS` invece delle 2 fasce fisse.
- `operatore` viene assegnato casualmente (es. 1 volta su 3) solo agli
  appuntamenti con `stato` Confermato o Da Rimodulare e con `rdlc` già
  valorizzato, scegliendo un nome dal pool filtrato per la stessa area
  del RDLC.

## Rischi / verifiche in fase di implementazione

- Cercare ogni confronto letterale su `fasciaOraria`/`fasciaOrariaRdlc`
  (es. `=== '09:00 - 13:00'`) e adattarlo alla granularità a 32 valori.
- Verificare se `ListView` espone oggi colonne di fascia oraria; se sì,
  applicare la stessa rinominazione/formattazione.
- Verificare tutti i punti di rendering che assumono "2 fasce per
  giorno" (larghezza colonne, colSpan, key React) e aggiornarli alla
  granularità oraria (8 colonne).
