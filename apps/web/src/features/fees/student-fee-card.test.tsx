import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import { concessionLabel, parseConcession, type Concession } from './fees-api';
import { StudentFeeCard } from './student-fee-card';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const accountant = make(['fee.read', 'fee.manage']);
const viewer = make(['fee.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const student = { id: 'st1', admissionNo: '0001', name: 'Ali Khan' };
const base = { student, className: 'Class 5', sectionName: null, totalAmount: 5000, discountAmount: 0, netAmount: 5000 };
const vouchers = [
  { ...base, id: 'v1', voucherNo: 'V-000001', period: '2026-10', dueDate: '2026-10-10', status: 'UNPAID', overdue: true, paidAmount: 0, balance: 5000 },
  { ...base, id: 'v2', voucherNo: 'V-000002', period: '2026-09', dueDate: '2026-09-10', status: 'PAID', overdue: false, paidAmount: 5000, balance: 0 },
  { ...base, id: 'v3', voucherNo: 'V-000003', period: '2026-08', dueDate: '2026-08-10', status: 'CANCELLED', overdue: false, paidAmount: 0, balance: 5000 },
];
const existing: Concession = { studentId: 'st1', sessionId: 's', kind: 'PERCENT', value: 10, reason: 'Sibling' };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
let concession: Concession | null = null;

function renderCard(user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/fees/concessions/st1')) {
      if (m === 'PUT') return json(200, { ...existing, ...JSON.parse(String(init?.body)) });
      if (m === 'DELETE') return json(204);
      return json(200, { concession });
    }
    if (url.includes('/fees/vouchers')) return json(200, vouchers);
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter><StudentFeeCard studentId="st1" /></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));

describe('concession helpers', () => {
  it('accepts a percentage only from 1 to 100 and a fixed amount above 0', () => {
    expect(parseConcession('PERCENT', '10')).toBe(10);
    expect(parseConcession('PERCENT', '100')).toBe(100);
    expect(parseConcession('PERCENT', '101')).toBeNull();
    expect(parseConcession('PERCENT', '0')).toBeNull();
    expect(parseConcession('FIXED', '1,500')).toBe(1500);
    expect(parseConcession('FIXED', '12.5')).toBeNull();
  });
  it('labels a concession', () => {
    expect(concessionLabel({ kind: 'PERCENT', value: 25 }, 'en')).toBe('25%');
    expect(concessionLabel({ kind: 'FIXED', value: 1500 }, 'en')).toContain('1,500');
  });
});

describe('student fee card', () => {
  beforeEach(() => { fetchMock.mockReset(); concession = null; });
  afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });

  it('shows totals without cancelled vouchers and asks only for this student', async () => {
    renderCard(viewer);
    expect(await screen.findByText('V-000001')).toBeInTheDocument();
    expect(screen.getByText('V-000002')).toBeInTheDocument();
    expect(screen.queryByText('V-000003')).toBeNull();
    expect(screen.getByText(/Overdue amount/)).toBeInTheDocument();
    expect(String(sent('GET', '/fees/vouchers')![0])).toContain('studentId=st1');
  });

  it('read-only users cannot change the concession', async () => {
    concession = existing;
    renderCard(viewer);
    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove concession' })).toBeNull();
  });

  it('sets a percentage concession', async () => {
    renderCard(accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'Set concession' }));
    await userEvent.type(await screen.findByLabelText('Value'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('PUT', '/fees/concessions/st1')).toBeTruthy());
    expect(JSON.parse(String(sent('PUT', '/fees/concessions/st1')![1]!.body))).toEqual({ kind: 'PERCENT', value: 10, reason: null });
  });

  it('blocks a percentage above 100', async () => {
    renderCard(accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'Set concession' }));
    await userEvent.type(await screen.findByLabelText('Value'), '150');
    expect(await screen.findByText('Enter a whole number from 1 to 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('removes a concession after confirmation', async () => {
    concession = existing;
    renderCard(accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove concession' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(sent('DELETE', '/fees/concessions/st1')).toBeTruthy());
  });
});
