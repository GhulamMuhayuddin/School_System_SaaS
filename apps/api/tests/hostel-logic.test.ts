import { describe, expect, it } from 'vitest';
import { bedState, canMoveIn, firstMisfit, genderAllowed, normalRoomNo, roomIncome } from '../src/modules/hostel/hostel.logic';

describe('who may live where', () => {
  it('boys hostel takes boys, girls hostel takes girls, mixed takes everyone', () => {
    expect(genderAllowed('BOYS', 'MALE')).toBe(true);
    expect(genderAllowed('BOYS', 'FEMALE')).toBe(false);
    expect(genderAllowed('BOYS', 'OTHER')).toBe(false);
    expect(genderAllowed('GIRLS', 'FEMALE')).toBe(true);
    expect(genderAllowed('GIRLS', 'MALE')).toBe(false);
    for (const g of ['MALE', 'FEMALE', 'OTHER'] as const) expect(genderAllowed('MIXED', g)).toBe(true);
  });
  it('finds the first resident who would not fit after a hostel changes kind', () => {
    expect(firstMisfit('BOYS', ['MALE', 'MALE'])).toBeNull();
    expect(firstMisfit('BOYS', ['MALE', 'FEMALE'])).toBe('FEMALE');
    expect(firstMisfit('MIXED', ['MALE', 'FEMALE', 'OTHER'])).toBeNull();
    expect(firstMisfit('GIRLS', [])).toBeNull();
  });
});

describe('beds', () => {
  it('describes a room by its beds', () => {
    expect(bedState(4, 3)).toBe('FREE');
    expect(bedState(4, 4)).toBe('FULL');
    expect(bedState(4, 5)).toBe('OVER');
  });
  it('lets a student move in only while a bed is free, but always be saved again in the same room', () => {
    expect(canMoveIn(2, 1, false)).toBe(true);
    expect(canMoveIn(2, 2, false)).toBe(false);
    expect(canMoveIn(2, 2, true)).toBe(true);
  });
  it('expected income of a room and tidy room numbers', () => {
    expect(roomIncome(6000, 2)).toBe(12000);
    expect(roomIncome(0, 2)).toBe(0);
    expect(roomIncome(6000, 0)).toBe(0);
    expect(normalRoomNo(' a-12 ')).toBe('A-12');
  });
});
