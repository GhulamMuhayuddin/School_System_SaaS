import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import FeesReportsPage from '@/pages/fees-reports';
import FeesSetupPage from '@/pages/fees-setup';
import FeesVouchersPage from '@/pages/fees-vouchers';
import { currentPeriod, fmtMoney, parseRupees, statusTone } from './fees-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const accountant = make(['fee.read', 'fee.manage', 'fee.collect', 'fee.report', 'academic.read']);
const viewer = make(['fee.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const classes = [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 2, sections: [] }];
const student = { id: 'st1', admissionNo: '0001', name: 'Ali Khan' };
const voucher = { id: 'v1', voucherNo: 'V-000001', period: '2026-11', dueDate: '2026-11-10', status: 'UNPAID', overdue: false, student, className: 'Class 5', sectionName: null, totalAmount: 5000, discountAmount: 500, netAmount: 4500, paidAmount: 0, balance: 4500 };
const detail = { ...voucher, cancelReason: null, items: [{ id: 'i1', description: 'Tuition', amount: 5000 }], payments: [] };
const heads = [{ id: 'h1', name: 'Tuition', isActive: true }];
const structure = { sessionId: 's', sessionName: '2026-2027', classId: 'c5', items: [{ feeHeadId: 'h1', feeHeadName: 'Tuition', amount: 5000, frequency: 'MONTHLY' }], monthlyTotal: 5000, oneTimeTotal: 0 };
const summary = { from: '2026-11-01', to: '2026-11-04', collected: 1500, receipts: 1, byMethod: [{ method: 'CASH', amount: 1500 }], billed: 9000, totalCollected: 1500, balance: 7500, overdueBalance: 3000 };
const defaulter = { student, className: 'Class 5', sectionName: null, vouchers: 2, balance: 3000, oldestDueDate: '2026-10-10' };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/academics/classes')) return json(200, { classes });
    if (url.includes('/fees/vouchers/v1/payments') && m === 'POST') return json(201, { id: 'p1', receiptNo: 'R-000001', voucherId: 'v1', voucherNo: 'V-000001', amount: 1500, method: 'CASH', reference: null, paidAt: '2026-11-04T10:00:00Z', voided: false, voidReason: null, student, period: '2026-11' });
    if (url.endsWith('/fees/vouchers/v1')) return json(200, detail);
    if (url.includes('/fees/vouchers')) return json(200, [voucher]);
    if (url.includes('/fees/heads') && m === 'POST') return json(201, { id: 'h2', name: 'Exam fee', isActive: true });
    if (url.includes('/fees/heads')) return json(200, heads);
    if (url.includes('/fees/structure/c5')) return json(200, structure);
    if (url.includes('/fees/reports/summary')) return json(200, summary);
    if (url.includes('/fees/reports/defaulters')) return json(200, [defaulter]);
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/app/fees" element={<FeesVouchersPage />} />
          <Route path="/app/fees/setup" element={<FeesSetupPage />} />
          <Route path="/app/fees/reports" element={<FeesReportsPage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));

describe('fee helpers', () => {
  it('parses rupee amounts', () => {
    expect(parseRupees('1,500')).toBe(1500);
    expect(parseRupees('0')).toBeNull();
    expect(parseRupees('12.5')).toBeNull();
    expect(parseRupees('')).toBeNull();
  });
  it('formats money, period and status colours', () => {
    expect(fmtMoney(1500, 'en')).toContain('1,500');
    expect(currentPeriod(new Date(2026, 10, 4))).toBe('2026-11');
    expect(statusTone('PAID', false)).toBe('success');
    expect(statusTone('UNPAID', true)).toBe('danger');
    expect(statusTone('CANCELLED', false)).toBe('neutral');
  });
});

describe('fees pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });

  it('lists vouchers and collects a payment', async () => {
    renderAt('/app/fees', accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'V-000001' }));
    expect(await screen.findByText('Tuition')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collect payment' }));
    const amount = await screen.findByLabelText('Amount (Rs)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1500');
    await userEvent.click(screen.getAllByRole('button', { name: 'Collect payment' }).at(-1)!);
    await waitFor(() => expect(sent('POST', '/fees/vouchers/v1/payments')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/fees/vouchers/v1/payments')![1]!.body))).toEqual({ amount: 1500, method: 'CASH', reference: null });
  });

  it('blocks an amount above the balance', async () => {
    renderAt('/app/fees', accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'V-000001' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Collect payment' }));
    const amount = await screen.findByLabelText('Amount (Rs)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '9000');
    expect(await screen.findByText('More than the balance')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Collect payment' }).at(-1)).toBeDisabled();
  });

  it('read-only users cannot generate or collect', async () => {
    renderAt('/app/fees', viewer);
    await userEvent.click(await screen.findByRole('button', { name: 'V-000001' }));
    await screen.findByText('Tuition');
    expect(screen.queryByRole('button', { name: 'Generate vouchers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collect payment' })).toBeNull();
  });

  it('shows the class structure and adds a fee head', async () => {
    renderAt('/app/fees/setup', accountant);
    expect(await screen.findByDisplayValue('5000')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New fee head'), 'Exam fee');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(sent('POST', '/fees/heads')).toBeTruthy());
  });

  it('shows the collection summary and defaulters', async () => {
    renderAt('/app/fees/reports', accountant);
    expect(await screen.findByText('Ali Khan (0001)')).toBeInTheDocument();
    expect((await screen.findAllByText(/3,000/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Collected in range')).toBeInTheDocument();
  });
});
