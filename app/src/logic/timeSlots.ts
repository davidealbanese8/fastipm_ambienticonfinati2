export type TimeSlot = string; // "HH:MM", inizio di un blocco da 15 minuti

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildRange(startHour: number, endHour: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 15, 30, 45]) slots.push(`${pad2(h)}:${pad2(m)}`);
  }
  return slots;
}

export const ALL_SLOTS: TimeSlot[] = [...buildRange(9, 13), ...buildRange(14, 18)];

export const WORK_HOURS: number[] = [9, 10, 11, 12, 14, 15, 16, 17];

export function hourOf(slot: TimeSlot): number {
  return Number(slot.slice(0, 2));
}

export function slotsInHour(hour: number): TimeSlot[] {
  return ALL_SLOTS.filter((s) => hourOf(s) === hour);
}

export function formatSlotRange(slot: TimeSlot): string {
  const [h, m] = slot.split(':').map(Number);
  let endH = h;
  let endM = m + 15;
  if (endM === 60) {
    endM = 0;
    endH += 1;
  }
  return `${slot}–${pad2(endH)}:${pad2(endM)}`;
}
