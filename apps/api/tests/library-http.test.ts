import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { LibraryApi } from '../src/modules/library/library.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';
const ID = '44444444-4444-4444-8444-444444444444';
const ID2 = '55555555-5555-4555-8555-555555555555';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = {
  viewer: ['library.read'], // e.g. principal
  desk: ['library.read', 'library.issue'],
  manager: ['library.read', 'library.manage'],
  librarian: ['library.read', 'library.issue', 'library.manage'],
  parent: ['portal.own.read', 'homework.read'],
  teacher: ['student.read'],
};
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const library = {
    settings: rec('settings'), saveSettings: rec('saveSettings'), summary: rec('summary'), listBooks: rec('listBooks', { books: [], categories: [], truncated: false }),
    createBook: rec('createBook'), getBook: rec('getBook'), updateBook: rec('updateBook'), addCopies: rec('addCopies'), setCopyStatus: rec('setCopyStatus'),
    issue: rec('issue'), returnLoan: rec('returnLoan'), renew: rec('renew'), settleFine: rec('settleFine'), listLoans: rec('listLoans', { loans: [], truncated: false }), studentLibrary: rec('studentLibrary'),
  } as unknown as LibraryApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    library,
  });
  return { app, calls };
}
type Built = ReturnType<typeof build>;
const send = async (b: Built, method: 'get' | 'post' | 'put' | 'patch', role: string, url: string, body?: object) => {
  const r = request(b.app)[method](url).set('Authorization', await bearer(role));
  return (body ? r.send(body) : r).then((x) => x.status);
};

const book = { title: 'Gulistan', author: 'Saadi', copies: 3 };
const endpoints: { method: 'get' | 'post' | 'put' | 'patch'; url: string; body?: object; need: 'read' | 'issue' | 'manage' }[] = [
  { method: 'get', url: '/api/library/summary', need: 'read' },
  { method: 'get', url: '/api/library/settings', need: 'read' },
  { method: 'get', url: '/api/library/books', need: 'read' },
  { method: 'get', url: `/api/library/books/${ID}`, need: 'read' },
  { method: 'get', url: '/api/library/loans', need: 'read' },
  { method: 'post', url: '/api/library/loans', body: { accessionNo: 'LIB-000001', studentId: ID }, need: 'issue' },
  { method: 'post', url: `/api/library/loans/${ID}/return`, need: 'issue' },
  { method: 'post', url: `/api/library/loans/${ID}/renew`, need: 'issue' },
  { method: 'post', url: `/api/library/loans/${ID}/fine`, body: { action: 'PAID' }, need: 'issue' },
  { method: 'put', url: '/api/library/settings', body: { loanDays: 14, finePerDay: 5, maxBooksStudent: 3 }, need: 'manage' },
  { method: 'post', url: '/api/library/books', body: book, need: 'manage' },
  { method: 'patch', url: `/api/library/books/${ID}`, body: { active: false }, need: 'manage' },
  { method: 'post', url: `/api/library/books/${ID}/copies`, body: { count: 2 }, need: 'manage' },
  { method: 'patch', url: `/api/library/copies/${ID}`, body: { status: 'LOST' }, need: 'manage' },
];

describe('library routes: permissions', () => {
  it('need sign-in and a school', async () => {
    const b = build();
    for (const e of endpoints) {
      expect((await request(b.app)[e.method](e.url).send(e.body)).status).toBe(401);
      expect((await request(b.app)[e.method](e.url).set('Authorization', await bearer('librarian', null)).send(e.body)).status).toBe(403);
    }
    expect(b.calls).toHaveLength(0);
  });
  it('keep parents, students and teachers out completely', async () => {
    const b = build();
    for (const e of endpoints) for (const role of ['parent', 'teacher']) expect(await send(b, e.method, role, e.url, e.body)).toBe(403);
    expect(b.calls).toHaveLength(0);
  });
  it('separate view, desk and catalogue rights', async () => {
    const b = build();
    for (const e of endpoints) {
      const ok = (role: string) => send(b, e.method, role, e.url, e.body).then((s) => s < 300);
      expect(await ok('librarian')).toBe(true);
      expect(await ok('viewer')).toBe(e.need === 'read');
      expect(await ok('desk')).toBe(e.need !== 'manage');
      expect(await ok('manager')).toBe(e.need !== 'issue');
    }
  });
});

describe('library routes: input and token', () => {
  it('use the school and user of the token, never the body', async () => {
    const b = build();
    expect(await send(b, 'post', 'librarian', '/api/library/loans', { accessionNo: 'LIB-000001', studentId: ID, schoolId: SCHOOL_B, issuedById: 'x' })).toBe(201);
    expect(b.calls[0]!.args[0]).toBe(SCHOOL_A);
    expect(b.calls[0]!.args[1]).toBe('actor');
    expect(b.calls[0]!.args[2]).toEqual({ accessionNo: 'LIB-000001', studentId: ID });
  });
  it('turn query text into the filters', async () => {
    const b = build();
    await send(b, 'get', 'viewer', '/api/library/books?q=gul&category=Poetry&available=true&includeInactive=true');
    expect(b.calls[0]!.args[1]).toEqual({ q: 'gul', category: 'Poetry', availableOnly: true, includeInactive: true });
    await send(b, 'get', 'viewer', '/api/library/loans?status=overdue&studentId=' + ID);
    expect(b.calls[1]!.args[1]).toEqual({ status: 'overdue', studentId: ID });
  });
  it('refuse bad input with 400 before the service is reached', async () => {
    const b = build();
    const bad: [string, string, object | undefined][] = [
      ['post', '/api/library/books', { author: 'x' }], ['post', '/api/library/books', { title: '', author: 'x' }], ['post', '/api/library/books', { ...book, copies: 101 }],
      ['post', '/api/library/books', { ...book, copies: -1 }], ['post', '/api/library/books', { ...book, copies: 1.5 }], ['patch', `/api/library/books/${ID}`, {}],
      ['patch', '/api/library/books/not-a-uuid', { active: true }], ['post', `/api/library/books/${ID}/copies`, { count: 0 }], ['post', `/api/library/books/${ID}/copies`, { count: 101 }],
      ['patch', `/api/library/copies/${ID}`, { status: 'ISSUED' }], ['patch', `/api/library/copies/${ID}`, { status: 'GONE' }],
      ['post', '/api/library/loans', { studentId: ID }], ['post', '/api/library/loans', { copyId: ID, accessionNo: 'LIB-000001', studentId: ID }],
      ['post', '/api/library/loans', { copyId: ID, studentId: 'nope' }], ['post', '/api/library/loans', { copyId: ID, studentId: ID, dueOn: '2026-02-30' }],
      ['post', '/api/library/loans', { copyId: ID, studentId: ID, dueOn: '06/11/2026' }], ['post', `/api/library/loans/${ID2}/fine`, { action: 'FREE' }],
      ['post', '/api/library/loans/not-a-uuid/return', undefined], ['put', '/api/library/settings', { loanDays: 0, finePerDay: 5, maxBooksStudent: 3 }],
      ['put', '/api/library/settings', { loanDays: 91, finePerDay: 5, maxBooksStudent: 3 }], ['put', '/api/library/settings', { loanDays: 14, finePerDay: -1, maxBooksStudent: 3 }],
      ['put', '/api/library/settings', { loanDays: 14, finePerDay: 5, maxBooksStudent: 0 }], ['put', '/api/library/settings', { loanDays: 14, finePerDay: 5 }],
      ['get', '/api/library/loans?status=weird', undefined], ['get', '/api/library/loans?studentId=x', undefined], ['get', '/api/library/books?available=maybe', undefined],
    ];
    for (const [m, url, body] of bad) expect([m, url, await send(b, m as 'get', 'librarian', url, body)]).toEqual([m, url, 400]);
    expect(b.calls).toHaveLength(0);
  });
});
