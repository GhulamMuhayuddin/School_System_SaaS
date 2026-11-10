import { describe, expect, it } from 'vitest';
import { canBoard, firstOutOfOrder, routeIncome, seatState, validTime } from '../src/modules/transport/transport.logic';

describe('pickup times', () => {
  it('accepts 24 hour HH:MM only', () => {
    for (const ok of ['00:00', '07:05', '13:45', '23:59']) expect(validTime(ok)).toBe(true);
    for (const bad of ['7:05', '24:00', '12:60', '07:5', '0705', '', 'ab:cd']) expect(validTime(bad)).toBe(false);
  });
  it('finds the first stop whose time goes backwards (blank times are skipped)', () => {
    expect(firstOutOfOrder(['06:50', '07:05', '07:20'])).toBeNull();
    expect(firstOutOfOrder(['06:50', null, '07:20', '07:20'])).toBeNull();
    expect(firstOutOfOrder(['07:10', '06:55', '07:20'])).toBe(2);
    expect(firstOutOfOrder([null, '07:30', null, '07:00'])).toBe(4);
    expect(firstOutOfOrder([])).toBeNull();
  });
});

describe('seats', () => {
  it('describes a route by its vehicle', () => {
    expect(seatState(null, 12)).toBe('NO_VEHICLE');
    expect(seatState(30, 29)).toBe('FREE');
    expect(seatState(30, 30)).toBe('FULL');
    expect(seatState(30, 31)).toBe('OVER');
  });
  it('lets a student board only while there is a seat, but always change stops on the same route', () => {
    expect(canBoard(30, 29, false)).toBe(true);
    expect(canBoard(30, 30, false)).toBe(false);
    expect(canBoard(30, 30, true)).toBe(true);
    expect(canBoard(null, 500, false)).toBe(true);
  });
  it('expected income of a route', () => {
    expect(routeIncome(2500, 24)).toBe(60000);
    expect(routeIncome(0, 24)).toBe(0);
    expect(routeIncome(2500, 0)).toBe(0);
  });
});
