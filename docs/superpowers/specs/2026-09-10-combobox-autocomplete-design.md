# Design: componente Combobox autocomplete per select e ricerca libera

Data: 2026-09-10

## Contesto

L'app usa oggi due pattern di input non uniformi:

1. **11 `<select>` HTML nativi** sparsi tra `DetailView`, `RiassegnaView`,
   `RdlcDrawer`, `CalendarioGlobaleView` — scelta di operatore/RDLC (spesso
   filtrato per area), slot orario, o area geografica.
2. **4 categorie di campi di ricerca libera** (`<input type="text">`) che
   filtrano dal vivo una tabella/griglia sottostante, senza alcun menu di
   risultati cliccabili: `RdlcDrawer`/`CalendarioGlobaleView` "Cerca
   operatore", `ListView` "Cerca RC, cliente, città...", e i filtri per
   colonna di `DataTable` (uno per colonna, multi-istanza).

L'utente vuole che digitando in uno qualsiasi di questi campi appaia un
menu di risultati filtrati cliccabili — un'esperienza da autocomplete/
combobox uniforme ovunque.

## Obiettivo

Un unico componente condiviso `src/components/common/Combobox.tsx` con due
modalità, sostituito a ognuno dei punti sopra senza cambiare la logica di
business esistente (stessi dispatch, stessi filtri) — cambia solo
l'interazione dell'input.

## Non-obiettivi

- Nessun cambiamento alla logica di filtro/dispatch esistente: il
  Combobox è un guscio di interazione, non cambia cosa succede quando un
  valore viene scelto o digitato.
- Nessuna modifica ai campi di inserimento libero senza lista di
  riferimento (nome Cameretta, password di LoginGate, textarea note): non
  sono nell'ambito di questa richiesta.
- Nessuna ricerca fuzzy/asincrona: il filtro è un substring match
  case-insensitive lato client sulle opzioni/suggerimenti già disponibili
  in memoria (stessa complessità di oggi).

## Componente

```ts
export interface ComboboxOption {
  value: string;
  label: string;
  group?: string; // per raggruppamento tipo <optgroup> (es. area)
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;                 // valore corrente committato; '' ammesso
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  freeSolo?: boolean;             // vedi "Due modalità" sotto
}
```

### Due modalità

**Modalità "select"** (`freeSolo` assente o `false`) — sostituisce le 11
`<select>` esistenti:
- L'input mostra la `label` dell'opzione corrispondente a `value` quando
  non ha il focus o il menu è chiuso.
- Digitando, il testo diventa una query: si apre un menu con le opzioni
  il cui `label` contiene la query (case-insensitive), raggruppate per
  `group` quando presente (intestazione di gruppo non selezionabile).
- `onChange` scatta **solo** quando l'utente sceglie un'opzione (click,
  o Invio sull'opzione evidenziata) — mai per la sola digitazione. Questo
  mantiene la stessa semantica commit-on-select di `<select>`.
- Frecce ↑/↓ spostano l'evidenziazione; Invio conferma; Esc chiude il
  menu e ripristina il testo alla label del valore committato; blur
  (dopo un breve delay per permettere il click su un'opzione) chiude il
  menu senza commit se non è stata scelta un'opzione.
- Se `value === ''` e nessuna opzione corrisponde (placeholder/"Nessuno"),
  l'input mostra `placeholder`.

**Modalità "ricerca libera"** (`freeSolo: true`) — sostituisce i 4 punti
di ricerca:
- `onChange` scatta ad **ogni carattere digitato** (comportamento
  identico a oggi: il filtro sulla tabella/griglia si aggiorna dal vivo).
- In aggiunta, si apre un menu di suggerimenti cliccabili (calcolati dal
  chiamante, vedi sotto) che matchano la query; cliccarne uno imposta il
  testo esatto e chiama `onChange` con quel valore, poi chiude il menu.
- Non c'è "commit richiesto": il valore digitato è sempre valido (è un
  filtro, non una scelta vincolata a una lista).

### Interfacce riusate (nessun cambiamento)

Tutti i dispatch (`ASSIGN_RDLC`, `REASSIGN_RDLC`, `REASSIGN_REMOTE_OPERATOR`,
`CONFIRM_APPT`, `RIMODULA_APPT`, ecc.) e tutte le funzioni di filtro
esistenti (`filterRows`, `filterByColumns`, i `.filter()` locali su
`operators`) restano invariate: il Combobox è collegato allo stesso
`value`/`onChange` che oggi collega il `<select>` o l'`<input>`.

## Sostituzioni puntuali

### Modalità "select" (11 punti, `freeSolo` assente)

1. `DetailView.tsx` — Slot orario (form nuovo appuntamento): opzioni da
   `ALL_SLOTS`.
2. `DetailView.tsx` — "Assegna RDLC a selezionati..." (toolbar bulk):
   opzioni = operatori filtrati per area del task.
3. `DetailView.tsx` — Operatore (modal conferma appuntamento): opzioni =
   operatori filtrati per area + opzione vuota "Nessuno — in presenza".
4. `DetailView.tsx` — Slot orario (modal rimodula/controproposta):
   opzioni da `ALL_SLOTS`.
5. `DetailView.tsx` — Operatore (modal rimodula, solo ramo Sicurezza):
   come punto 3.
6. `DetailView.tsx` (`ApptRow`) — "Seleziona op" per riga appuntamento:
   opzioni = operatori filtrati per area, multi-istanza (una per riga).
7. `RiassegnaView.tsx` — Operatore (form di ricerca): opzioni = tutti gli
   operatori, raggruppati per area (`group: o.area`).
8. `RiassegnaView.tsx` — "Nuovo RDLC" per riga risultato: opzioni = tutti
   gli operatori, multi-istanza.
9. `RiassegnaView.tsx` — "Operatore (remoto)" per riga risultato: opzioni
   = tutti gli operatori + "Nessuno — in presenza", multi-istanza.
10. `RdlcDrawer.tsx` — Filtro area: opzioni = `AREAS` + "Tutte le aree".
11. `CalendarioGlobaleView.tsx` — Filtro area: opzioni = `AREAS` + "Tutte
    le aree".

### Modalità "ricerca libera" (4 punti, `freeSolo: true`)

- `RdlcDrawer.tsx` / `CalendarioGlobaleView.tsx` — "Cerca operatore":
  suggerimenti = nomi degli operatori (già filtrati per area se
  selezionata) che contengono la query, max 8.
- `ListView.tsx` — "Cerca RC, cliente, città...": suggerimenti = valori
  distinti di `protocollo`, `cliente`, `citta` tra i task correnti che
  contengono la query, deduplicati, max 8.
- `DataTable.tsx` — filtro per colonna: suggerimenti = valori distinti
  (stringa) di quella colonna tra le righe correnti (prima di applicare
  il filtro di quella stessa colonna, per non nascondere opzioni valide)
  che contengono la query, max 8.

## Rischi/verifiche in fase di implementazione

- `RdlcDrawer`/`CalendarioGlobaleView` hanno sia il filtro area (select)
  sia la ricerca operatore (freeSolo): verificare che i due si combinino
  come oggi (AND tra area e substring nome).
- Il commit-on-select della modalità "select" deve gestire correttamente
  il caso in cui l'utente digita del testo poi clicca fuori senza
  scegliere nulla: il valore committato non deve cambiare (torna alla
  label del valore precedente).
- Accessibilità minima: `role="combobox"`/`listbox`/`option` con
  `aria-expanded`/`aria-activedescendant` dove ragionevole, senza
  bloccare la consegna se richiede tempo sproporzionato — non è un
  requisito esplicito dell'utente, va bene un'implementazione base con
  gestione da tastiera funzionante.
