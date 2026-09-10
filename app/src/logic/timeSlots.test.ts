import { describe, expect, it } from 'vitest';
import { ALL_SLOTS, WORK_HOURS, hourOf, slotsInHour, formatSlotRange } from './timeSlots';

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
});
