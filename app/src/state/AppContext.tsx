import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { generateMockTasks } from '../logic/mockData';
import { buildRdlcPool } from '../logic/operators';
import * as rules from '../logic/rules';
import type { Operator, Role, Task, TimeSlot } from '../types';

export type View = 'list' | 'detail' | 'calendarioGlobale' | 'riassegna';

export interface ToastState {
  id: number;
  message: string;
  kind?: 'success' | 'error' | 'info';
}

export interface ErrorModalState {
  title: string;
  message: string;
}

export interface AppState {
  role: Role;
  view: View;
  currentProtocollo: string | null;
  tasks: Record<string, Task>;
  operators: Operator[];
  toast: ToastState | null;
  errorModal: ErrorModalState | null;
  notesModalProtocollo: string | null;
  selectedApptIds: number[];
}

type Action =
  | { type: 'SET_ROLE'; role: Role }
  | { type: 'NAVIGATE'; view: View; protocollo?: string | null }
  | { type: 'SHOW_TOAST'; message: string; kind?: ToastState['kind'] }
  | { type: 'DISMISS_TOAST' }
  | { type: 'SHOW_ERROR'; title: string; message: string }
  | { type: 'DISMISS_ERROR' }
  | { type: 'OPEN_NOTES'; protocollo: string }
  | { type: 'CLOSE_NOTES' }
  | { type: 'TOGGLE_APPT_SELECTION'; id: number }
  | { type: 'SET_SELECTION'; ids: number[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'APPUNTAMENTA'; protocollo: string }
  | { type: 'CONFIRM_REALIZZAZIONE'; protocollo: string }
  | { type: 'RIAPPUNTAMENTA'; protocollo: string }
  | { type: 'CONFIRM_RC'; protocollo: string }
  | { type: 'RIMODULA_RC'; protocollo: string; note?: string }
  | { type: 'CONFIRM_APPT'; protocollo: string; apptId: number; operatore?: string }
  | { type: 'CONFIRM_APPTS_BULK'; protocollo: string; apptIds: number[]; operatore?: string }
  | { type: 'RIMODULA_APPT'; protocollo: string; apptId: number; data: string; slot: TimeSlot; operatore?: string }
  | { type: 'RIMODULA_APPTS_BULK'; protocollo: string; apptIds: number[]; data: string; slot: TimeSlot; operatore?: string }
  | { type: 'REALIZZAZIONE_RIMODULA_APPT'; protocollo: string; apptId: number; data: string; slot: TimeSlot }
  | { type: 'REALIZZAZIONE_RIMODULA_APPTS_BULK'; protocollo: string; apptIds: number[]; data: string; slot: TimeSlot }
  | { type: 'ADD_APPOINTMENT'; protocollo: string; cameretta: string; data: string; slot: TimeSlot }
  | { type: 'DELETE_APPOINTMENT'; protocollo: string; apptId: number }
  | { type: 'ASSIGN_RDLC'; protocollo: string; apptIds: number[]; rdlcName: string; day: string; slot: TimeSlot }
  | { type: 'REASSIGN_RDLC'; protocollo: string; apptId: number; rdlcName: string }
  | { type: 'REASSIGN_OPERATORE'; protocollo: string; apptId: number; operatore: string };

let toastCounter = 0;

function initState(): AppState {
  const tasks: Record<string, Task> = {};
  for (const t of generateMockTasks(120)) tasks[t.protocollo] = t;
  return {
    role: 'realizzazione',
    view: 'list',
    currentProtocollo: null,
    tasks,
    operators: buildRdlcPool(),
    toast: null,
    errorModal: null,
    notesModalProtocollo: null,
    selectedApptIds: [],
  };
}

function withRuleGuard(state: AppState, protocollo: string, fn: (t: Task) => Task, successMessage?: string): AppState {
  const task = state.tasks[protocollo];
  if (!task) return state;
  try {
    const next = fn(task);
    return {
      ...state,
      tasks: { ...state.tasks, [protocollo]: next },
      toast: successMessage
        ? { id: ++toastCounter, message: successMessage, kind: 'success' }
        : state.toast,
    };
  } catch (e) {
    if (e instanceof rules.RuleError) {
      return { ...state, errorModal: { title: 'Attenzione', message: e.message } };
    }
    throw e;
  }
}

/** Like withRuleGuard, but clears the row selection once the (atomic) bulk action succeeds. */
function withBulkSelectionGuard(
  state: AppState,
  protocollo: string,
  fn: (t: Task) => Task,
  successMessage?: string
): AppState {
  const result = withRuleGuard(state, protocollo, fn, successMessage);
  return result.errorModal ? result : { ...result, selectedApptIds: [] };
}

function withBulkRuleGuard(
  state: AppState,
  protocollo: string,
  ids: number[],
  fn: (t: Task, id: number) => Task,
  successMessage?: string
): AppState {
  const task = state.tasks[protocollo];
  if (!task) return state;
  try {
    let next = task;
    for (const id of ids) next = fn(next, id);
    return {
      ...state,
      tasks: { ...state.tasks, [protocollo]: next },
      selectedApptIds: [],
      toast: successMessage ? { id: ++toastCounter, message: successMessage, kind: 'success' } : state.toast,
    };
  } catch (e) {
    if (e instanceof rules.RuleError) {
      return { ...state, errorModal: { title: 'Attenzione', message: e.message } };
    }
    throw e;
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.role, view: 'list', currentProtocollo: null, selectedApptIds: [] };
    case 'NAVIGATE':
      return { ...state, view: action.view, currentProtocollo: action.protocollo ?? state.currentProtocollo, selectedApptIds: [] };
    case 'SHOW_TOAST':
      return { ...state, toast: { id: ++toastCounter, message: action.message, kind: action.kind } };
    case 'DISMISS_TOAST':
      return { ...state, toast: null };
    case 'SHOW_ERROR':
      return { ...state, errorModal: { title: action.title, message: action.message } };
    case 'DISMISS_ERROR':
      return { ...state, errorModal: null };
    case 'OPEN_NOTES': {
      const task = state.tasks[action.protocollo];
      const nextTasks =
        task && task.pendingSicurezzaNote
          ? { ...state.tasks, [action.protocollo]: { ...task, pendingSicurezzaNote: false } }
          : state.tasks;
      return { ...state, notesModalProtocollo: action.protocollo, tasks: nextTasks };
    }
    case 'CLOSE_NOTES':
      return { ...state, notesModalProtocollo: null };
    case 'TOGGLE_APPT_SELECTION': {
      const has = state.selectedApptIds.includes(action.id);
      return {
        ...state,
        selectedApptIds: has ? state.selectedApptIds.filter((i) => i !== action.id) : [...state.selectedApptIds, action.id],
      };
    }
    case 'SET_SELECTION':
      return { ...state, selectedApptIds: action.ids };
    case 'CLEAR_SELECTION':
      return { ...state, selectedApptIds: [] };

    case 'APPUNTAMENTA':
      return withRuleGuard(state, action.protocollo, rules.appuntamenta, 'Appuntamento inviato.');
    case 'CONFIRM_REALIZZAZIONE':
      return withRuleGuard(state, action.protocollo, rules.confirmRealizzazione, 'Task confermato.');
    case 'RIAPPUNTAMENTA':
      return withRuleGuard(state, action.protocollo, rules.riappuntamenta, 'Task riappuntamentato.');
    case 'CONFIRM_RC':
      return withRuleGuard(state, action.protocollo, rules.confirmRc, 'Task confermato.');
    case 'RIMODULA_RC':
      return withRuleGuard(state, action.protocollo, (t) => rules.rimodulaRc(t, action.note), 'Task rimodulato.');

    case 'CONFIRM_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.confirmAppt(t, action.apptId, action.operatore),
        'Appuntamento confermato.'
      );
    case 'CONFIRM_APPTS_BULK':
      return withBulkSelectionGuard(
        state,
        action.protocollo,
        (t) => rules.confirmApptsBulk(t, action.apptIds, action.operatore),
        'Appuntamenti confermati.'
      );
    case 'RIMODULA_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.rimodulaAppt(t, action.apptId, action.data, action.slot, action.operatore),
        'Proposta di rimodulazione inviata.'
      );
    case 'RIMODULA_APPTS_BULK':
      return withBulkSelectionGuard(
        state,
        action.protocollo,
        (t) => rules.rimodulaApptsBulk(t, action.apptIds, action.data, action.slot, action.operatore),
        'Proposta di rimodulazione inviata.'
      );
    case 'REALIZZAZIONE_RIMODULA_APPT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.realizzazioneRimodulaAppt(t, action.apptId, action.data, action.slot),
        'Controproposta inviata.'
      );
    case 'REALIZZAZIONE_RIMODULA_APPTS_BULK':
      return withBulkSelectionGuard(
        state,
        action.protocollo,
        (t) => rules.realizzazioneRimodulaApptsBulk(t, action.apptIds, action.data, action.slot),
        'Controproposte inviate.'
      );
    case 'ADD_APPOINTMENT':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.addAppointment(t, action.cameretta, action.data, action.slot),
        'Appuntamento aggiunto.'
      );
    case 'DELETE_APPOINTMENT':
      return withRuleGuard(state, action.protocollo, (t) => rules.deleteAppointment(t, action.apptId), 'Appuntamento eliminato.');
    case 'ASSIGN_RDLC':
      return withBulkRuleGuard(
        state,
        action.protocollo,
        action.apptIds,
        (t, id) => rules.assignRdlc(t, [id], action.rdlcName, action.day, action.slot),
        'RDLC assegnato.'
      );
    case 'REASSIGN_RDLC':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.reassignRdlc(t, action.apptId, action.rdlcName),
        'RDLC riassegnato.'
      );
    case 'REASSIGN_OPERATORE':
      return withRuleGuard(
        state,
        action.protocollo,
        (t) => rules.reassignOperatore(t, action.apptId, action.operatore),
        action.operatore ? 'Operatore riassegnato.' : 'Operatore rimosso.'
      );
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const stateValue = useMemo(() => state, [state]);
  return (
    <AppStateContext.Provider value={stateValue}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

export function useAppDispatch(): Dispatch<Action> {
  const ctx = useContext(AppDispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
}

export type { Action as AppAction };
