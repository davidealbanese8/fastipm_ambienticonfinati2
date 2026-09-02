import { useAppDispatch, useAppState } from '../../state/AppContext';
import { Modal } from './Modal';

export function NotesModal() {
  const { notesModalProtocollo, tasks } = useAppState();
  const dispatch = useAppDispatch();
  if (!notesModalProtocollo) return null;
  const task = tasks[notesModalProtocollo];
  if (!task) return null;

  return (
    <Modal title={`Note — ${task.protocollo}`} onClose={() => dispatch({ type: 'CLOSE_NOTES' })}>
      {task.notes.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Nessuna nota presente.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {task.notes.map((n, i) => {
            const odd = i % 2 === 0;
            const colors = odd ? { bg: '#FBF7E9', border: '#F1E4B8' } : { bg: '#EEF2FA', border: '#DCE3FB' };
            return (
              <div
                key={i}
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#6b7280', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#374151' }}>{n.author}</span>
                  <span>{n.timestamp}</span>
                </div>
                <div style={{ fontSize: 13, color: '#1d2027' }}>{n.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
