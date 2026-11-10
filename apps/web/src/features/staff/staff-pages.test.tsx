import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import StaffDetailPage from '@/pages/staff-detail';
import StaffListPage from '@/pages/staff-list';
import StaffNewPage from '@/pages/staff-new';

const ROLE = '55555555-5555-4555-8555-555555555555';
const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const hr = make(['staff.read', 'staff.create', 'staff.update', 'staff.delete', 'school.role.manage']);
const clerk = make(['staff.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const row = { id: 'f1', employeeNo: 'E-001', firstName: 'Sana', lastName: 'Iqbal', gender: 'FEMALE', category: 'TEACHING', designation: 'Maths Teacher', phone: '0300-1234567', status: 'ACTIVE', hasAccount: false };
const detail = { ...row, email: null, cnic: null, address: null, dateOfBirth: null, qualification: 'MSc', joiningDate: '2026-04-01', leftAt: null, leftReason: null, notes: null, createdAt: '2026-10-01T00:00:00Z', account: null };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/roles')) return json(200, { roles: [{ id: ROLE, key: 'teacher', name: 'Teacher' }, { id: 'p', key: 'parent', name: 'Parent' }] });
    if (url.endsWith('/school/staff/f1/account') && m === 'POST') return json(201, { user: { id: 'u1', email: 'sana@school.test' } });
    if (url.endsWith('/staff/f1') && m === 'GET') return json(200, { staff: detail });
    if (url.endsWith('/staff') && m === 'POST') return json(201, { staff: detail });
    if (url.includes('/staff?')) return json(200, { staff: [row], total: 1 });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/staff" element={<StaffListPage />} />
          <Route path="/app/staff/new" element={<StaffNewPage />} />
          <Route path="/app/staff/:id" element={<StaffDetailPage />} />
        </Routes>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}

describe('staff pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lists staff and shows "Add staff member" only to users who may create', async () => {
    const view = renderAt('/app/staff', hr);
    expect(await screen.findByText('Sana Iqbal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add staff member' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/staff', clerk);
    expect(await screen.findByText('Sana Iqbal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add staff member' })).not.toBeInTheDocument();
  });

  it('validates the form, then sends the new staff member', async () => {
    const user = userEvent.setup();
    renderAt('/app/staff/new', hr);
    await screen.findByRole('heading', { name: 'Add staff member' });
    await user.click(screen.getByRole('button', { name: 'Save staff member' }));
    expect((await screen.findAllByText('This field is required')).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/staff'))).toBe(false);
    await user.type(screen.getByLabelText('First name'), 'Sana');
    await user.type(screen.getByLabelText('Last name'), 'Iqbal');
    await user.type(screen.getByLabelText('Phone'), '0300-1234567');
    await user.type(screen.getByLabelText('Designation'), 'Maths Teacher');
    await user.click(screen.getByRole('button', { name: 'Save staff member' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/staff'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ firstName: 'Sana', category: 'TEACHING', designation: 'Maths Teacher' });
    });
  });

  it('creates a login with a chosen role (parent role is not offered)', async () => {
    const user = userEvent.setup();
    renderAt('/app/staff/f1', hr);
    await user.click(await screen.findByRole('button', { name: 'Create login' }));
    const dialog = await screen.findByRole('dialog');
    await screen.findByRole('option', { name: 'Teacher' });
    expect(screen.queryByRole('option', { name: 'Parent' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'sana@school.test');
    await user.selectOptions(screen.getByLabelText('Role'), ROLE);
    await user.type(screen.getByLabelText('Initial password'), 'a-long-password-1');
    await user.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Create login')!);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/school/staff/f1/account'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toEqual({ email: 'sana@school.test', password: 'a-long-password-1', roleId: ROLE });
    });
  });

  it('hides edit, leave, login and delete actions from read-only users', async () => {
    renderAt('/app/staff/f1', clerk);
    await screen.findByText('Maths Teacher', { exact: false });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as left' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
