/** Pure communication rules (no database). */
export type Audience = 'ALL' | 'STAFF' | 'PARENTS' | 'STUDENTS' | 'CLASS';
export type ViewerKind = 'STAFF' | 'PARENT' | 'STUDENT';
export type NoticeStatus = 'LIVE' | 'EXPIRED' | 'WITHDRAWN';
export interface Viewer { kind: ViewerKind; classIds: string[] }

/**
 * Who sees an announcement. Staff (and any login that is neither a student nor a guardian) see everything.
 * A parent sees ALL, PARENTS and the CLASS notices of their children's classes; a student sees ALL, STUDENTS and their own class.
 */
export function visibleTo(viewer: Viewer, a: { audience: Audience; classId: string | null }): boolean {
  if (viewer.kind === 'STAFF') return true;
  if (a.audience === 'ALL') return true;
  if (a.audience === 'CLASS') return a.classId !== null && viewer.classIds.includes(a.classId);
  return viewer.kind === 'PARENT' ? a.audience === 'PARENTS' : a.audience === 'STUDENTS';
}

/** WITHDRAWN beats EXPIRED. An announcement is live through its expiry day. Dates are "YYYY-MM-DD". */
export function statusOf(a: { withdrawnAt: string | null; expiresOn: string | null }, today: string): NoticeStatus {
  if (a.withdrawnAt !== null) return 'WITHDRAWN';
  if (a.expiresOn !== null && a.expiresOn < today) return 'EXPIRED';
  return 'LIVE';
}

/** CLASS needs a class; every other audience must not carry one. Returns a message, or null when fine. */
export function audienceError(audience: Audience, classId: string | null | undefined): string | null {
  if (audience === 'CLASS') return classId ? null : 'Choose the class for this announcement';
  return classId ? 'A class can only be chosen when the audience is a class' : null;
}
