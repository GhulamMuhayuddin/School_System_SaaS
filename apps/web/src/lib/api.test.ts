import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, getAccessToken, setAccessToken, setSessionLostHandler } from './api';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (token: string) => ({ accessToken: token, expiresIn: 900, user: { id: '1' } });

describe('api client', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken(null);
    setSessionLostHandler(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  const authHeader = (call: number) => (fetchMock.mock.calls[call]![1]!.headers as Record<string, string>).Authorization;

  it('sends the access token as a Bearer header and always includes cookies', async () => {
    setAccessToken('tok-1');
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    expect(await apiFetch('/auth/me')).toEqual({ ok: true });
    expect(authHeader(0)).toBe('Bearer tok-1');
    expect(fetchMock.mock.calls[0]![1]!.credentials).toBe('include');
  });

  it('on 401 refreshes once, then retries with the new token', async () => {
    setAccessToken('old');
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
      .mockResolvedValueOnce(json(200, session('new')))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    expect(await apiFetch('/students')).toEqual({ data: 1 });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/students', '/api/auth/refresh', '/api/students']);
    expect(authHeader(2)).toBe('Bearer new');
    expect(getAccessToken()).toBe('new');
  });

  it('shares ONE refresh between concurrent requests', async () => {
    setAccessToken('old');
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/auth/refresh') return json(200, session('new'));
      return (init!.headers as Record<string, string>).Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
    });
    await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/auth/refresh')).toHaveLength(1);
  });

  it('when the refresh fails, signs the UI out and throws the 401', async () => {
    const lost = vi.fn();
    setSessionLostHandler(lost);
    setAccessToken('old');
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })).mockResolvedValueOnce(json(401, { error: { code: 'SESSION_EXPIRED', message: 'x' } }));
    await expect(apiFetch('/students')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it('does not try to refresh for login-style calls (auth: false)', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }));
    const error = await apiFetch('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a network failure into NETWORK_ERROR and handles 204', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiFetch('/x', { auth: false })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await apiFetch('/auth/logout', { method: 'POST', auth: false })).toBeUndefined();
  });

  it('never stores the access token in browser storage', async () => {
    setAccessToken('secret-token');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-token');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-token');
  });
});
