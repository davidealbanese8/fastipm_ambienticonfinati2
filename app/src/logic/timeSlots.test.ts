import { describe, expect, it } from 'vitest';
import {
  ALL_SLOTS,
  AFTERNOON_SLOTS,
  MORNING_SLOTS,
  WORK_HOURS,
  buildSlotRuns,
  endOfSlot,
  hourOf,
  slotsInHour,
  formatSlotRange,
} from './timeSlots';

describe('timeSlots', () => {
  it('generates 32 slots across the two work ranges', () => {
    expect(ALL_SLOTS).toHaveLength(32);
    expect(ALL_SLOTS[0]).toBe('09:00');
    expect(ALL_SLOTS[15]).toBe('12:45');
    expect(ALL_SLOTS[16]).toBe('14:00');
    expect(ALL_SLOTS[31]).toBe('17:45');
    expect(ALL_SLOTS).not.toContain('13:00');
    expect(ALL_SLOTS).not.toContain('18:00');
  });

  it('exposes the 8 work hours used as calendar columns', () => {
    expect(WORK_HOURS).toEqual([9, 10, 11, 12, 14, 15, 16, 17]);
  });

  it('hourOf extracts the hour from a slot', () => {
    expect(hourOf('09:15')).toBe(9);
    expect(hourOf('17:45')).toBe(17);
  });

  it('slotsInHour returns the 4 quarter-hour slots for that hour', () => {
    expect(slotsInHour(9)).toEqual(['09:00', '09:15', '09:30', '09:45']);
    expect(slotsInHour(13)).toEqual([]); // lunch break, not a work hour
  });

  it('formatSlotRange shows start–end of the 15-minute block', () => {
    expect(formatSlotRange('09:15')).toBe('09:15–09:30');
    expect(formatSlotRange('12:45')).toBe('12:45–13:00');
    expect(formatSlotRange('17:45')).toBe('17:45–18:00');
  });

  it('endOfSlot rolls over the hour', () => {
    expect(endOfSlot('09:00')).toBe('09:15');
    expect(endOfSlot('09:45')).toBe('10:00');
    expect(endOfSlot('12:45')).toBe('13:00');
  });

  it('splits the day into two 16-slot strips around the 13–14 break', () => {
    expect(MORNING_SLOTS).toHaveLength(16);
    expect(AFTERNOON_SLOTS).toHaveLength(16);
    expect(MORNING_SLOTS[0]).toBe('09:00');
    expect(MORNING_SLOTS[15]).toBe('12:45');
    expect(AFTERNOON_SLOTS[0]).toBe('14:00');
    expect(AFTERNOON_SLOTS[15]).toBe('17:45');
  });
});

describe('buildSlotRuns', () => {
  const runsFor = (booked: string[]) => buildSlotRuns(MORNING_SLOTS, (s) => booked.includes(s));

  it('returns nothing for a free strip', () => {
    expect(runsFor([])).toEqual([]);
  });

  it('labels a lone quarter with its start time only', () => {
    const runs = runsFor(['09:30']);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ startIndex: 2, length: 1, label: '9:30' });
  });

  it('merges adjacent quarters into one labelled range', () => {
    const runs = runsFor(['10:00', '10:15', '10:30', '10:45']);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ startIndex: 4, length: 4, label: '10:00–11:00' });
  });

  it('keeps two bookings in the same hour separate when a free quarter splits them', () => {
    // The case the grid has to make legible: 09:00 and 09:30 booked, 09:15/09:45 free.
    const runs = runsFor(['09:00', '09:30']);
    expect(runs.map((r) => r.label)).toEqual(['9:00', '9:30']);
    expect(runs.map((r) => r.startIndex)).toEqual([0, 2]);
  });

  it('merges across an hour boundary, since the strip is continuous', () => {
    const runs = runsFor(['09:45', '10:00']);
    expect(runs).toHaveLength(1);
    expect(runs[0].label).toBe('9:45–10:15');
  });

  it('never merges across the lunch break, because the strips are separate', () => {
    const morning = buildSlotRuns(MORNING_SLOTS, (s) => ['12:45'].includes(s));
    const afternoon = buildSlotRuns(AFTERNOON_SLOTS, (s) => ['14:00'].includes(s));
    expect(morning[0].label).toBe('12:45');
    expect(afternoon[0].label).toBe('14:00');
  });

  it('handles a fully booked strip as one run', () => {
    const runs = buildSlotRuns(MORNING_SLOTS, () => true);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ startIndex: 0, length: 16, label: '9:00–13:00' });
  });
});
