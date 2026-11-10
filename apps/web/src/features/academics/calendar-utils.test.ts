import { describe, expect, it } from 'vitest';
import { buildMonthGrid, eventsInMonth, eventsOnDay, gridRange, shiftMonth } from './calendar-utils';

describe('buildMonthGrid', () => {
  it('draws whole Monday-first weeks around the month (March 2026 starts on a Sunday)', () => {
    const weeks = buildMonthGrid(2026, 2, '2026-03-15');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].iso).toBe('2026-02-23'); // Monday before Sunday 1 March
    expect(weeks[0][6]).toMatchObject({ iso: '2026-03-01', day: 1, inMonth: true });
    expect(weeks[5][6].iso).toBe('2026-04-05');
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('marks today and supports a Sunday start', () => {
    const monday = buildMonthGrid(2026, 2, '2026-03-15');
    expect(monday.flat().filter((c) => c.isToday).map((c) => c.iso)).toEqual(['2026-03-15']);
    const sunday = buildMonthGrid(2026, 2, '2026-03-15', 0);
    expect(sunday[0][0].iso).toBe('2026-03-01');
    expect(sunday).toHaveLength(5);
  });

  it('uses exactly four rows for a February that starts on a Monday (2027)', () => {
    const weeks = buildMonthGrid(2027, 1, '2027-02-10');
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].iso).toBe('2027-02-01');
    expect(weeks[3][6].iso).toBe('2027-02-28');
  });

  it('reports the range to fetch', () => {
    expect(gridRange(buildMonthGrid(2026, 2, '2026-03-15'))).toEqual({ from: '2026-02-23', to: '2026-04-05' });
  });
});

describe('shiftMonth', () => {
  it('rolls over year boundaries in both directions', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe('event matching', () => {
  const events = [
    { id: 'eid', startDate: '2026-03-20', endDate: '2026-03-24' },
    { id: 'sports', startDate: '2026-03-30', endDate: '2026-03-30' },
    { id: 'winter', startDate: '2026-02-26', endDate: '2026-03-03' },
  ];
  it('finds the events on a day, including multi-day ones at both ends', () => {
    expect(eventsOnDay(events, '2026-03-20').map((e) => e.id)).toEqual(['eid']);
    expect(eventsOnDay(events, '2026-03-24').map((e) => e.id)).toEqual(['eid']);
    expect(eventsOnDay(events, '2026-03-25')).toEqual([]);
    expect(eventsOnDay(events, '2026-03-02').map((e) => e.id)).toEqual(['winter']);
  });
  it('lists events touching a month, even when they start in the month before', () => {
    expect(eventsInMonth(events, 2026, 2).map((e) => e.id)).toEqual(['eid', 'sports', 'winter']);
    expect(eventsInMonth(events, 2026, 3)).toEqual([]);
  });
});
