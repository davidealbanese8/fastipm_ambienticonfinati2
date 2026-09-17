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

/** The slot that ends this one, i.e. its start + 15 minutes. */
export function endOfSlot(slot: TimeSlot): TimeSlot {
  const [h, m] = slot.split(':').map(Number);
  let endH = h;
  let endM = m + 15;
  if (endM === 60) {
    endM = 0;
    endH += 1;
  }
  return `${pad2(endH)}:${pad2(endM)}`;
}

export function formatSlotRange(slot: TimeSlot): string {
  return `${slot}–${endOfSlot(slot)}`;
}

// The working day splits at the 13–14 break. Rendering it as two continuous strips keeps
// every quarter the same width, so the same clock time sits at the same x in every row —
// which is what makes "who is free at 09:30?" a vertical scan rather than a lookup.
export const MORNING_SLOTS: TimeSlot[] = ALL_SLOTS.filter((s) => hourOf(s) < 13);
export const AFTERNOON_SLOTS: TimeSlot[] = ALL_SLOTS.filter((s) => hourOf(s) >= 14);

export const MORNING_HOURS: number[] = WORK_HOURS.filter((h) => h < 13);
export const AFTERNOON_HOURS: number[] = WORK_HOURS.filter((h) => h >= 14);

/** "09:15" → "9:15". Drops the padding zero to buy back width on the calendar chips, where
 *  a single quarter is only ~14px wide; "14:00" is unaffected. */
export function compactTime(slot: TimeSlot): string {
  return slot.startsWith('0') ? slot.slice(1) : slot;
}

/** One run of consecutive booked quarters inside a strip, ready to be drawn as a chip. */
export interface SlotRun {
  /** Position of the run's first quarter within its strip (0-based). */
  startIndex: number;
  /** How many consecutive quarters the run covers. */
  length: number;
  slots: TimeSlot[];
  /** "09:00" for a single quarter, "10:00–11:00" for a longer run. */
  label: string;
}

/**
 * Collapses the booked quarters of one strip into runs of adjacent slots.
 *
 * Adjacent bookings merge into a single labelled chip ("10:00–11:00") instead of four
 * cramped ones, which is what keeps the written time affordable: the grid is ~99% free,
 * so runs are few and short and almost never collide.
 */
export function buildSlotRuns(stripSlots: TimeSlot[], isBooked: (slot: TimeSlot) => boolean): SlotRun[] {
  const runs: SlotRun[] = [];
  let current: TimeSlot[] = [];
  let startIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    const last = current[current.length - 1];
    runs.push({
      startIndex,
      length: current.length,
      slots: current,
      label:
        current.length === 1
          ? compactTime(current[0])
          : `${compactTime(current[0])}–${compactTime(endOfSlot(last))}`,
    });
    current = [];
  };

  stripSlots.forEach((slot, i) => {
    if (isBooked(slot)) {
      if (current.length === 0) startIndex = i;
      current.push(slot);
    } else {
      flush();
    }
  });
  flush();
  return runs;
}
