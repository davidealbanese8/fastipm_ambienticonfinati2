import { WarningCircle } from '@phosphor-icons/react';
import { useAppDispatch, useAppState } from '../../state/AppContext';
import { Modal } from './Modal';
import { Button } from './Button';

export function ErrorModal() {
  const { errorModal } = useAppState();
  const dispatch = useAppDispatch();
  if (!errorModal) return null;

  return (
    <Modal
      title={errorModal.title}
      onClose={() => dispatch({ type: 'DISMISS_ERROR' })}
      footer={
        <Button variant="primary" onClick={() => dispatch({ type: 'DISMISS_ERROR' })}>
          Ho capito
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <WarningCircle size={22} color="#C0392B" weight="fill" />
        <p style={{ margin: 0, fontSize: 13.5, color: '#374151' }}>{errorModal.message}</p>
      </div>
    </Modal>
  );
}
