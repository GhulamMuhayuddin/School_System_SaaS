import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AuthApi } from '../src/modules/auth/auth.types';
import { AccessTokenService } from '../src/modules/auth/tokens';
import type { CommunicationApi } from '../src/modules/communication/communication.types';

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';
const tokens = new AccessTokenService('t'.repeat(40), 15);
const perms: Record<string, string[]> = { reader: ['communication.read'], sender: ['communication.read', 'communication.send'], sendOnly: ['communication.send'], none: ['student.read'] };
const bearer = async (roleId: string, schoolId: string | null = SCHOOL_A, userId = 'actor') => `Bearer ${(await tokens.sign({ userId, schoolId, roleId, roleKey: 'x' })).token}`;

function build() {
  const calls: { name: string; args: unknown[] }[] = [];
  const rec = (name: string, ret: unknown = {}) => async (...args: unknown[]) => { calls.push({ name, args }); return ret; };
  const comm = {
    inbox: rec('inbox', { announcements: [], unread: 0 }), unreadCount: rec('unreadCount', 3), markRead: rec('markRead'), markAllRead: rec('markAllRead', 2),
    create: rec('create'), listSent: rec('listSent', { announcements: [], truncated: false }), withdraw: rec('withdraw'),
  } as unknown as CommunicationApi;
  const app = createApp({
    logger: pino({ level: 'silent' }), corsOrigins: [], checkDatabase: async () => {},
    auth: { service: {} as AuthApi, verifyAccessToken: (t) => tokens.verify(t), permissions: { get: async (id) => new Set(perms[id] ?? []) }, cookie: { name: 'nexora_rt', secure: false } },
    communication: comm,
  });
  return { app, calls };
}
type M = 'get' | 'post';
const call = async (app: ReturnType<typeof build>['app'], role: string, m: M, url: string, body?: object) =>
  (await request(app)[m](url).set('Authorization', await bearer(role)).send(body)).status;
const notice = { title: 'Sports day', body: 'Sports day is on Friday.', audience: 'ALL' };

describe('communication routes', () => {
  it('reading needs a login, a school and communication.read', async () => {
    const { app } = build();
    expect((await request(app).get('/api/communication/announcements')).status).toBe(401);
    expect(await call(app, 'none', 'get', '/api/communication/announcements')).toBe(403);
    expect(await call(app, 'sendOnly', 'get', '/api/communication/announcements')).toBe(403);
    expect((await request(app).get('/api/communication/announcements').set('Authorization', await bearer('reader', null))).status).toBe(403);
    for (const url of ['/api/communication/announcements', '/api/communication/announcements?unreadOnly=true', '/api/communication/unread-count']) expect(await call(app, 'reader', 'get', url)).toBe(200);
    expect(await call(app, 'reader', 'post', `/api/communication/announcements/${ID}/read`)).toBe(204);
    expect(await call(app, 'reader', 'post', '/api/communication/announcements/read-all')).toBe(200);
  });
  it('sending, the sent list and withdrawing need communication.read AND communication.send', async () => {
    const { app } = build();
    for (const role of ['reader', 'sendOnly']) {
      expect(await call(app, role, 'post', '/api/communication/announcements', notice)).toBe(403);
      expect(await call(app, role, 'get', '/api/communication/sent')).toBe(403);
      expect(await call(app, role, 'post', `/api/communication/announcements/${ID}/withdraw`)).toBe(403);
    }
    expect(await call(app, 'sender', 'post', '/api/communication/announcements', notice)).toBe(201);
    expect(await call(app, 'sender', 'get', '/api/communication/sent')).toBe(200);
    expect(await call(app, 'sender', 'post', `/api/communication/announcements/${ID}/withdraw`)).toBe(200);
  });
  it('validates input', async () => {
    const { app } = build();
    const n = (b: object) => call(app, 'sender', 'post', '/api/communication/announcements', { ...notice, ...b });
    expect(await n({ title: 'ab' })).toBe(400);
    expect(await n({ body: '' })).toBe(400);
    expect(await n({ body: 'x'.repeat(3001) })).toBe(400);
    expect(await n({ audience: 'EVERYONE' })).toBe(400);
    expect(await n({ priority: 'URGENT' })).toBe(400);
    expect(await n({ classId: 'nope' })).toBe(400);
    expect(await n({ expiresOn: '2026-02-30' })).toBe(400);
    expect(await call(app, 'reader', 'post', '/api/communication/announcements/nope/read')).toBe(400);
    expect(await call(app, 'reader', 'get', '/api/communication/announcements?unreadOnly=maybe')).toBe(400);
  });
  it('who is reading and the school come from the token only', async () => {
    const { app, calls } = build();
    await request(app).get('/api/communication/announcements?unreadOnly=true&userId=someone-else').set('Authorization', await bearer('reader', SCHOOL_A, 'u-1'));
    expect(calls.find((c) => c.name === 'inbox')!.args).toEqual([SCHOOL_A, 'u-1', true]);
    await request(app).post('/api/communication/announcements').set('Authorization', await bearer('sender', SCHOOL_A, 'u-2')).send({ ...notice, schoolId: 'evil', createdById: 'forged' });
    const c = calls.find((x) => x.name === 'create')!;
    expect(c.args.slice(0, 2)).toEqual([SCHOOL_A, 'u-2']);
    expect(c.args[2]).toEqual(notice);
  });
});
