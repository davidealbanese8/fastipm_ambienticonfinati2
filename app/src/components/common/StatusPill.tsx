import { displayLabel, getStatusColor } from '../../tokens';
import type { AppointmentStatus, RcStatus } from '../../types';

export function StatusPill({ status, level }: { status: RcStatus | AppointmentStatus; level: 'rc' | 'appointment' }) {
  const color = getStatusColor(status);
  const label = displayLabel(status, level);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        background: color.bg,
        color: color.text,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
