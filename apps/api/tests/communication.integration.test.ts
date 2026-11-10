/**
 * Real database test of Phase 16A announcements. Needs the migration with announcements / announcement_reads, `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Setup: Class 5 and Class 6. Teacher Sara (staff), a parent whose child is in Class 5, a student login in Class 6, and a school admin with no staff record.
 * Notices (today = 2026-11-04): N1 everyone, N2 parents, N3 students, N4 staff only, N5 Class 5, N6 Class 6, N7 everyone but expired yesterday.
 * Staff and the admin see N1-N6 (6). The Class 5 parent sees N1, N2, N5 (3). The Class 6 student sees N1, N3, N6 (3). N7 is hidden from everybody.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommunicationService } from '../src/modules/communication/communication.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('communication (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: CommunicationService;
  const tag = `com-${Date.now()}`;
  let a = ''; let b = ''; let admin = '';
  let teacherUser = ''; let parentUser = ''; let studentUser = ''; let loneParentUser = '';
  let class5 = ''; let class6 = '';
  const n: Record<string, string> = {};
  const titles = async (userId: string, unreadOnly = false) => (await svc.inbox(a, userId, unreadOnly)).announcements.map((x) => x.title).sort();

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new CommunicationService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = async (key: string) => (await owner.role.findFirstOrThrow({ where: { schoolId: null, key } })).id;
    const user = async (key: string, roleKey: string) => (await owner.user.create({ data: { schoolId: a, roleId: await role(roleKey), email: `${tag}-${key}@example.test`, passwordHash: 'x', firstName: key, lastName: 'U' } })).id;
    admin = await user('admin', 'school_admin'); teacherUser = await user('teacher', 'teacher'); parentUser = await user('parent', 'parent'); studentUser = await user('student', 'student'); loneParentUser = await user('lone', 'parent');
    class5 = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 5', level: 5 } } as never)).id;
    class6 = (await owner.schoolClass.create({ data: { schoolId: a, name: 'Class 6', level: 6 } } as never)).id;
    await owner.staff.create({ data: { schoolId: a, employeeNo: `${tag}-1`, firstName: 'Sara', lastName: 'K', gender: 'FEMALE', phone: '0300-0000000', category: 'TEACHING', designation: 'Teacher', joiningDate: new Date('2025-01-01T00:00:00Z'), userId: teacherUser } } as never);
    const stu = (no: string, classId: string, extra: object = {}) => owner.student.create({ data: { schoolId: a, admissionNo: `${tag}-${no}`, firstName: no, lastName: 'S', gender: 'MALE', dateOfBirth: new Date('2015-01-01T00:00:00Z'), classId, admissionDate: new Date('2025-04-01T00:00:00Z'), ...extra } } as never);
    const child = await stu('child', class5);
    await stu('own', class6, { userId: studentUser });
    const guardian = await owner.guardian.create({ data: { schoolId: a, name: 'Parent P', phone: '0300-1111111', userId: parentUser } } as never);
    await owner.studentGuardian.create({ data: { schoolId: a, studentId: child.id, guardianId: guardian.id, relation: 'FATHER', isPrimary: true } } as never);
    await owner.guardian.create({ data: { schoolId: a, name: 'Lone Parent', phone: '0300-2222222', userId: loneParentUser } } as never); // no children linked
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('refuses a class notice without a class, a plain notice with one, an unknown class and a past end date', async () => {
    await expect(svc.create(a, admin, { title: 'No class', body: 'Body text', audience: 'CLASS' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create(a, admin, { title: 'Stray class', body: 'Body text', audience: 'ALL', classId: class5 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create(a, admin, { title: 'Ghost class', body: 'Body text', audience: 'CLASS', classId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.create(a, admin, { title: 'Too late', body: 'Body text', audience: 'ALL', expiresOn: '2026-11-03' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.create(b, admin, { title: 'Other school class', body: 'Body text', audience: 'CLASS', classId: class5 })).rejects.toMatchObject({ status: 404 }); // a class of another school
  });

  it('sends announcements to every audience', async () => {
    const send = async (key: string, audience: 'ALL' | 'STAFF' | 'PARENTS' | 'STUDENTS' | 'CLASS', extra: object = {}) => { n[key] = (await svc.create(a, admin, { title: key, body: 'Please read this.', audience, ...extra })).id; };
    await send('N1', 'ALL', { priority: 'IMPORTANT' }); await send('N2', 'PARENTS'); await send('N3', 'STUDENTS'); await send('N4', 'STAFF');
    await send('N5', 'CLASS', { classId: class5 }); await send('N6', 'CLASS', { classId: class6 });
    await owner.announcement.create({ data: { schoolId: a, title: 'N7', body: 'Expired notice', audience: 'ALL', expiresOn: new Date('2026-11-03T00:00:00Z'), publishedAt: new Date('2026-11-01T00:00:00Z') } });
    const sent = await svc.listSent(a);
    expect(sent.announcements).toHaveLength(7);
    expect(sent.announcements.find((x) => x.title === 'N5')).toMatchObject({ className: 'Class 5', status: 'LIVE', readCount: 0, author: 'admin U' });
    expect(sent.announcements.find((x) => x.title === 'N7')!.status).toBe('EXPIRED');
  });

  it('each kind of user sees only what is addressed to them', async () => {
    expect(await titles(teacherUser)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'N6']); // staff see everything live
    expect(await titles(admin)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);      // a login without staff record sees everything too
    expect(await titles(parentUser)).toEqual(['N1', 'N2', 'N5']);                    // the child is in Class 5
    expect(await titles(studentUser)).toEqual(['N1', 'N3', 'N6']);                   // the student is in Class 6
    expect(await titles(loneParentUser)).toEqual(['N1', 'N2']);                      // no children linked: only the general ones
  });

  it('important notices come first and the unread count matches', async () => {
    const inbox = await svc.inbox(a, parentUser, false);
    expect(inbox.announcements[0].title).toBe('N1');
    expect(inbox.announcements[0].priority).toBe('IMPORTANT');
    expect(inbox.unread).toBe(3);
    expect(await svc.unreadCount(a, parentUser)).toBe(3);
  });

  it('marking read works only for notices you may see, and is idempotent', async () => {
    await expect(svc.markRead(a, parentUser, n.N3)).rejects.toMatchObject({ status: 404 }); // students-only
    await expect(svc.markRead(a, parentUser, n.N4)).rejects.toMatchObject({ status: 404 }); // staff-only
    await svc.markRead(a, parentUser, n.N1);
    await svc.markRead(a, parentUser, n.N1);
    expect(await svc.unreadCount(a, parentUser)).toBe(2);
    expect((await svc.inbox(a, parentUser, true)).announcements.map((x) => x.title).sort()).toEqual(['N2', 'N5']);
    expect(await svc.unreadCount(a, teacherUser)).toBe(6); // reading is per person
    expect(await svc.markAllRead(a, parentUser)).toBe(2);
    expect(await svc.unreadCount(a, parentUser)).toBe(0);
    expect(await svc.markAllRead(a, parentUser)).toBe(0);
    expect((await svc.listSent(a)).announcements.find((x) => x.title === 'N1')!.readCount).toBe(1);
  });

  it('withdrawing hides a notice from readers, once only', async () => {
    const w = await svc.withdraw(a, admin, n.N2);
    expect(w.status).toBe('WITHDRAWN');
    await expect(svc.withdraw(a, admin, n.N2)).rejects.toMatchObject({ status: 409 });
    expect(await titles(parentUser)).toEqual(['N1', 'N5']);
    expect(await titles(teacherUser)).toEqual(['N1', 'N3', 'N4', 'N5', 'N6']);
    expect((await svc.listSent(a)).announcements.find((x) => x.title === 'N2')!.status).toBe('WITHDRAWN');
  });

  it('keeps schools apart', async () => {
    await expect(svc.withdraw(b, admin, n.N1)).rejects.toMatchObject({ status: 404 });
    expect((await svc.listSent(b)).announcements).toEqual([]);
    expect((await svc.inbox(b, admin, false)).announcements).toEqual([]);
  });
});
