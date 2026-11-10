import { describe, expect, it } from 'vitest';
import { audienceError, statusOf, visibleTo, type Viewer } from '../src/modules/communication/communication.logic';

const staff: Viewer = { kind: 'STAFF', classIds: [] };
const parent: Viewer = { kind: 'PARENT', classIds: ['c5', 'c7'] };
const student: Viewer = { kind: 'STUDENT', classIds: ['c5'] };
const all = { audience: 'ALL', classId: null } as const;
const parents = { audience: 'PARENTS', classId: null } as const;
const students = { audience: 'STUDENTS', classId: null } as const;
const staffOnly = { audience: 'STAFF', classId: null } as const;
const class5 = { audience: 'CLASS', classId: 'c5' } as const;
const class9 = { audience: 'CLASS', classId: 'c9' } as const;

describe('who sees an announcement', () => {
  it('staff see everything', () => {
    for (const a of [all, parents, students, staffOnly, class5, class9]) expect(visibleTo(staff, a)).toBe(true);
  });
  it('a parent sees everyone, parents and the classes of their children only', () => {
    expect(visibleTo(parent, all)).toBe(true);
    expect(visibleTo(parent, parents)).toBe(true);
    expect(visibleTo(parent, class5)).toBe(true);
    expect(visibleTo(parent, students)).toBe(false);
    expect(visibleTo(parent, staffOnly)).toBe(false);
    expect(visibleTo(parent, class9)).toBe(false);
  });
  it('a student sees everyone, students and their own class only', () => {
    expect(visibleTo(student, all)).toBe(true);
    expect(visibleTo(student, students)).toBe(true);
    expect(visibleTo(student, class5)).toBe(true);
    expect(visibleTo(student, parents)).toBe(false);
    expect(visibleTo(student, staffOnly)).toBe(false);
    expect(visibleTo(student, { audience: 'CLASS', classId: 'c7' })).toBe(false);
  });
  it('a parent with no children linked sees only the general ones', () => {
    const lonely: Viewer = { kind: 'PARENT', classIds: [] };
    expect(visibleTo(lonely, all)).toBe(true);
    expect(visibleTo(lonely, class5)).toBe(false);
    expect(visibleTo(lonely, { audience: 'CLASS', classId: null })).toBe(false);
  });
});

describe('announcement status and audience checks', () => {
  it('is live through its last day, expired after, and withdrawn beats expired', () => {
    expect(statusOf({ withdrawnAt: null, expiresOn: null }, '2026-11-04')).toBe('LIVE');
    expect(statusOf({ withdrawnAt: null, expiresOn: '2026-11-04' }, '2026-11-04')).toBe('LIVE');
    expect(statusOf({ withdrawnAt: null, expiresOn: '2026-11-03' }, '2026-11-04')).toBe('EXPIRED');
    expect(statusOf({ withdrawnAt: '2026-11-04T09:00:00Z', expiresOn: '2026-11-03' }, '2026-11-04')).toBe('WITHDRAWN');
  });
  it('a class notice needs a class and no other audience may carry one', () => {
    expect(audienceError('CLASS', 'c5')).toBeNull();
    expect(audienceError('CLASS', null)).not.toBeNull();
    expect(audienceError('CLASS', undefined)).not.toBeNull();
    expect(audienceError('ALL', null)).toBeNull();
    expect(audienceError('PARENTS', 'c5')).not.toBeNull();
  });
});
