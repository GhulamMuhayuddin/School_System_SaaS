/**
 * Real database test of Phase 15B complaints. Needs the migration with complaints / complaint_notes, `pnpm db:rls`.
 * Run:  set RUN_DB_TESTS=1  then  pnpm --filter @nexora/api test
 * Flow: C-000001 is logged OPEN -> assigned to Sara -> IN_PROGRESS -> RESOLVED (resolution required) -> CLOSED -> reopened (OPEN, resolved time cleared).
 * CLOSED straight from OPEN is refused. Every assignment and status change leaves a timeline entry.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ComplaintsService } from '../src/modules/complaints/complaints.service';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')('complaints (PostgreSQL)', () => {
  let owner: PrismaClient; let runtime: PrismaClient; let svc: ComplaintsService;
  const tag = `cmp-${Date.now()}`;
  let a = ''; let b = ''; let actor = ''; let sara = ''; let gone = '';
  let id = ''; let second = '';

  beforeAll(async () => {
    owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
    runtime = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    svc = new ComplaintsService(runtime, () => new Date('2026-11-04T09:00:00Z'));
    a = (await owner.school.create({ data: { name: `${tag} A`, code: `${tag}-a` } })).id;
    b = (await owner.school.create({ data: { name: `${tag} B`, code: `${tag}-b` } })).id;
    const role = (await owner.role.findFirstOrThrow({ where: { schoolId: null, key: 'principal' } })).id;
    actor = (await owner.user.create({ data: { schoolId: a, roleId: role, email: `${tag}@example.test`, passwordHash: 'x', firstName: 'Pri', lastName: 'Ncipal' } })).id;
    const mk = async (n: number, name: string, extra: object = {}) => (await owner.staff.create({
      data: { schoolId: a, employeeNo: `${tag}-${n}`, firstName: name, lastName: 'K', gender: 'FEMALE', phone: '0300-0000000', category: 'TEACHING', designation: 'Teacher', joiningDate: new Date('2025-01-01T00:00:00Z'), ...extra },
    } as never)).id;
    sara = await mk(1, 'Sara');
    gone = await mk(2, 'Gul', { status: 'LEFT', leftAt: new Date('2026-09-30T00:00:00Z'), leftReason: 'Moved' });
  });
  afterAll(async () => {
    await owner.school.deleteMany({ where: { id: { in: [a, b] } } }).catch(() => {});
    await owner.$disconnect(); await runtime.$disconnect();
  });

  it('logs a complaint with a number, defaults and an unknown student refused', async () => {
    const d = await svc.create(a, actor, { source: 'PARENT', name: ' Mrs Aslam ', phone: '0300-1234567', category: 'FEES', subject: 'Fee charged twice', details: 'October fee was taken two times.', priority: 'HIGH' });
    id = d.complaint.id;
    expect(d.complaint).toMatchObject({ complaintNo: 'C-000001', name: 'Mrs Aslam', status: 'OPEN', priority: 'HIGH', assignedTo: null, resolution: null, student: null });
    expect(d.notes).toEqual([]);
    const n = await svc.create(a, actor, { source: 'STAFF', name: 'Mr Imran', category: 'FACILITIES', subject: 'Broken fan in Class 3', details: 'The fan makes a loud noise.' });
    second = n.complaint.id;
    expect(n.complaint).toMatchObject({ complaintNo: 'C-000002', priority: 'NORMAL' });
    await expect(svc.create(a, actor, { source: 'PARENT', name: 'Mrs Ghost', category: 'OTHER', subject: 'About a student', details: 'Some details', studentId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ status: 404 });
    expect((await svc.create(b, actor, { source: 'OTHER', name: 'Visitor B', category: 'OTHER', subject: 'Parking', details: 'Parking is full' })).complaint.complaintNo).toBe('C-000001');
  });

  it('assigns to active staff only, and records it on the timeline', async () => {
    const d = await svc.assign(a, actor, id, sara);
    expect(d.complaint.assignedTo).toEqual({ id: sara, name: 'Sara K' });
    expect(d.notes.map((x) => [x.kind, x.text])).toEqual([['ASSIGN', 'Assigned to Sara K']]);
    expect(d.notes[0].by).toBe('Pri Ncipal');
    await expect(svc.assign(a, actor, id, sara)).rejects.toMatchObject({ status: 409 });
    await expect(svc.assign(a, actor, id, gone)).rejects.toMatchObject({ status: 400 });
    await expect(svc.assign(a, actor, id, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
    await expect(svc.assign(b, actor, id, sara)).rejects.toMatchObject({ status: 404 });
  });

  it('follows the status rules; resolving needs a resolution; reopening clears the resolved time', async () => {
    await expect(svc.setStatus(a, actor, id, 'CLOSED', null)).rejects.toMatchObject({ status: 409 }); // OPEN -> CLOSED
    await expect(svc.setStatus(a, actor, id, 'RESOLVED', '  ')).rejects.toMatchObject({ status: 400 });
    let d = await svc.setStatus(a, actor, id, 'IN_PROGRESS', null);
    expect(d.complaint.status).toBe('IN_PROGRESS');
    d = await svc.setStatus(a, actor, id, 'RESOLVED', 'Duplicate charge refunded');
    expect(d.complaint).toMatchObject({ status: 'RESOLVED', resolution: 'Duplicate charge refunded', resolvedAt: '2026-11-04T09:00:00.000Z' });
    await expect(svc.setStatus(a, actor, id, 'IN_PROGRESS', null)).rejects.toMatchObject({ status: 409 });
    d = await svc.setStatus(a, actor, id, 'CLOSED', null);
    expect(d.complaint.status).toBe('CLOSED');
    d = await svc.setStatus(a, actor, id, 'OPEN', null);
    expect(d.complaint).toMatchObject({ status: 'OPEN', resolvedAt: null });
    expect(d.notes.map((x) => x.text)).toEqual([
      'Assigned to Sara K', 'Status: OPEN → IN_PROGRESS', 'Status: IN_PROGRESS → RESOLVED. Duplicate charge refunded', 'Status: RESOLVED → CLOSED', 'Status: CLOSED → OPEN',
    ]);
  });

  it('adds follow-up notes, edits details and keeps schools apart', async () => {
    const d = await svc.addNote(a, actor, id, '  Called the parent, she is happy.  ');
    expect(d.notes.at(-1)).toMatchObject({ kind: 'NOTE', text: 'Called the parent, she is happy.', by: 'Pri Ncipal' });
    const u = await svc.update(a, actor, id, { priority: 'LOW', subject: 'Fee charged twice (October)', phone: null });
    expect(u.complaint).toMatchObject({ priority: 'LOW', subject: 'Fee charged twice (October)', phone: null });
    await expect(svc.addNote(b, actor, id, 'x')).rejects.toMatchObject({ status: 404 });
    await expect(svc.get(b, id)).rejects.toMatchObject({ status: 404 });
  });

  it('lists with filters and summarizes', async () => {
    await svc.setStatus(a, actor, second, 'RESOLVED', 'Fan replaced');
    const all = await svc.list(a, { activeOnly: false });
    expect(all.complaints.map((c) => c.complaintNo)).toEqual(['C-000002', 'C-000001']); // newest first
    expect((await svc.list(a, { activeOnly: true })).complaints.map((c) => c.complaintNo)).toEqual(['C-000001']);
    expect((await svc.list(a, { activeOnly: false, status: 'RESOLVED' })).complaints.map((c) => c.complaintNo)).toEqual(['C-000002']);
    expect((await svc.list(a, { activeOnly: false, category: 'FEES' })).complaints).toHaveLength(1);
    expect((await svc.list(a, { activeOnly: false, assignedStaffId: sara })).complaints.map((c) => c.complaintNo)).toEqual(['C-000001']);
    expect((await svc.list(a, { activeOnly: false, q: 'fan' })).complaints.map((c) => c.complaintNo)).toEqual(['C-000002']);
    expect(await svc.summary(a)).toEqual({ open: 1, inProgress: 0, highActive: 0, resolved: 1 }); // C-000001 was lowered to LOW
    expect((await svc.list(b, { activeOnly: false })).complaints.map((c) => c.name)).toEqual(['Visitor B']);
  });
});
