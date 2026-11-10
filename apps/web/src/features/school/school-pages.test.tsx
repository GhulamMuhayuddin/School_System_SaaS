import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import HomePage from '@/pages/home';
import SchoolUsersPage from '@/pages/school-users';

const ROLE_T = '55555555-5555-4555-8555-555555555555';
const ROLE_A = '66666666-6666-4666-8666-666666666666';
const make = (key: string, permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key, name: key }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const admin = make('school_admin', ['school.audit.view', 'school.role.manage', 'school.settings.manage']);
const teacher = make('teacher', ['student.read']);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const overview = {
  school: { id: 's1', name: 'City School', code: 'city', status: 'ACTIVE', city: 'Lahore' }, subscription: null,
  currentSession: { id: 'x', name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' },
  counts: { users: 7, activeUsers: 6, classes: 4, sections: 9, subjects: 12 },
  usersByRole: [{ roleKey: 'teacher', roleName: 'Teacher', count: 5 }], logins7d: 31, failedLogins7d: 0, recentActivity: [],
};
const row = (id: string, first: string, roleId: string, key: string) => ({
  id, email: `${first.toLowerCase()}@school.test`, firstName: first, lastName: 'Test', phone: null, status: 'ACTIVE',
  role: { id: roleId, key, name: key }, lastLoginAt: null, createdAt: '2026-10-01T00:00:00Z',
});

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/school/overview')) return json(200, { overview });
    if (url.endsWith('/roles')) return json(200, { roles: [{ id: ROLE_T, key: 'teacher', name: 'Teacher' }, { id: ROLE_A, key: 'school_admin', name: 'School Administrator' }] });
    if (url.endsWith('/school/users') && method === 'POST') return json(201, { user: row('u9', 'Newbie', ROLE_T, 'teacher') });
    if (url.endsWith('/school/users')) return json(200, { users: [row('me', 'Meher', ROLE_A, 'school_admin'), row('u2', 'Tina', ROLE_T, 'teacher')] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/app" element={<HomePage />} /><Route path="/app/school/users" element={<SchoolUsersPage />} /></Routes>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

describe('School Admin pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('shows real school numbers to an administrator', async () => {
    renderAt('/app', admin);
    expect(await screen.findByText('Welcome, Meher')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('2026-2027')).toBeInTheDocument();
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
  });

  it('keeps the labelled sample dashboard for roles without a real dashboard yet', async () => {
    renderAt('/app', teacher);
    expect(await screen.findByText(/Sample data/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/school/overview'))).toBe(false);
  });

  it('lists users (no deactivate on yourself) and creates one with the chosen role', async () => {
    const user = userEvent.setup();
    renderAt('/app/school/users', admin);
    expect(await screen.findByText('Tina Test')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(1);
    await user.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect((await within(dialog).findAllByText('This field is required')).length).toBeGreaterThan(0);
    await user.type(within(dialog).getByLabelText('First name'), 'Newbie');
    await user.type(within(dialog).getByLabelText('Last name'), 'Test');
    await user.type(within(dialog).getByLabelText('Email'), 'newbie@school.test');
    await user.selectOptions(within(dialog).getByLabelText('Role'), ROLE_T);
    await user.type(within(dialog).getByLabelText('Initial password'), 'long-enough-pw');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/school/users'))).toBe(true));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/school/users'))!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ email: 'newbie@school.test', roleId: ROLE_T, phone: null });
  });
});
