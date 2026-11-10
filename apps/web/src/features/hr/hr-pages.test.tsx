import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import type { SessionUser } from '@/lib/api';
import LeavePage from '@/pages/leave';
import MyPayslipsPage from '@/pages/my-payslips';
import PayrollPage from '@/pages/payroll';
import { currentPeriod, daysBetween, leaveTone, parseAmount, parseQuota, periodLabel, slipNetWith, todayText } from './hr-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Hira', lastName: 'Manager', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const teacher = make(['leave.apply']);
const approver = make(['leave.apply', 'leave.read', 'leave.approve']);
const hr = make(['payroll.read', 'payroll.manage']);
const cashier = make(['payroll.read', 'accounts.manage']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const casual = { id: 't1', name: 'Casual leave', yearlyQuota: 10, paid: true, active: true };
const balances = { staff: { id: 'st1', employeeNo: 'E-1', name: 'Sara Khan' }, year: 2026, balances: [{ leaveType: { id: 't1', name: 'Casual leave', paid: true }, balance: { quota: 10, used: 3, pending: 0, remaining: 7 } }] };
const request = { id: 'r1', requestNo: 'L-000001', staff: { id: 'st1', employeeNo: 'E-1', name: 'Sara Khan' }, leaveType: { id: 't1', name: 'Casual leave', paid: true }, fromDate: '2026-11-09', toDate: '2026-11-11', days: 3, reason: 'Family wedding', status: 'PENDING', decidedAt: null, decisionNote: null, createdAt: '2026-11-04T09:00:00Z' };
const totals = { slips: 2, gross: 45000, net: 34500, paidSlips: 0, paidAmount: 0, unpaidAmount: 34500 };
const slip = {
  id: 's1', slipNo: 'P-000001', runId: 'run1', period: '2026-10', staff: { id: 'st1', employeeNo: 'E-1', name: 'Ahmed S', designation: 'Teacher' }, basic: 25000, allowances: 5000, fixedDeduction: 1500,
  absentDays: 3, unpaidLeaveDays: 1, outsideDays: 0, deductionDays: 4, attendanceDeduction: 4000, bonus: 0, otherDeduction: 0, note: null, gross: 30000, net: 24500, paid: false, paidOn: null, method: null, accountEntryNo: null, paymentVoided: false,
};
const run = (status: 'DRAFT' | 'FINALIZED') => ({ id: 'run1', period: '2026-10', status, createdAt: '2026-11-04T09:00:00Z', finalizedAt: status === 'FINALIZED' ? '2026-11-04T10:00:00Z' : null, totals, payslips: [slip], skipped: [{ id: 'st9', employeeNo: 'E-9', name: 'Cara S' }] });
const salaryRows = [
  { staff: { id: 'st1', employeeNo: 'E-1', name: 'Ahmed S', designation: 'Teacher', category: 'TEACHING' }, salary: { basic: 25000, allowances: 5000, fixedDeduction: 1500, gross: 30000, notes: null } },
  { staff: { id: 'st9', employeeNo: 'E-9', name: 'Cara S', designation: 'Clerk', category: 'ADMINISTRATIVE' }, salary: null },
];

function setup(user: SessionUser, ui: React.ReactNode, status: 'DRAFT' | 'FINALIZED' = 'DRAFT') {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/leave/requests/r1/') && m === 'POST') return json(200, { ...request, status: 'APPROVED' });
    if (url.includes('/leave/requests') && m === 'POST') return json(201, request);
    if (url.includes('/leave/requests')) return json(200, { requests: [request], truncated: false });
    if (url.includes('/leave/balances')) return json(200, balances);
    if (url.includes('/leave/types')) return json(200, [casual]);
    if (url.includes('/staff?')) return json(200, { staff: [], total: 0 });
    if (url.includes('/payroll/payslips/s1/pay')) return json(200, { ...slip, paid: true });
    if (url.includes('/payroll/payslips/s1') && m === 'PATCH') return json(200, { ...slip, bonus: 2000, net: 26500 });
    if (url.includes('/payroll/salaries/') && m === 'PUT') return json(200, salaryRows[1]);
    if (url.includes('/payroll/salaries')) return json(200, { rows: salaryRows, truncated: false });
    if (url.includes('/payroll/runs/run1')) return json(200, run(status));
    if (url.includes('/payroll/runs')) return json(200, { runs: [{ id: 'run1', period: '2026-10', status, createdAt: '2026-11-04T09:00:00Z', finalizedAt: null, totals }] });
    if (url.includes('/payroll/my')) return json(200, { payslips: [{ ...slip, paid: true }] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/x']}><Suspense fallback={null}>
        <Routes><Route path="/app/x" element={ui} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));
const tab = async (nav: string, name: string) => userEvent.click(within(await screen.findByRole('navigation', { name: nav })).getByRole('button', { name }));

describe('hr helpers', () => {
  it('counts leave days and checks amounts like the server', () => {
    expect(daysBetween('2026-11-09', '2026-11-11')).toBe(3);
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(1);
    expect(daysBetween('2026-11-11', '2026-11-09')).toBe(0);
    expect(daysBetween('', '2026-11-09')).toBe(0);
    expect(parseQuota('')).toBeNull();
    expect(parseQuota('10')).toBe(10);
    expect(parseQuota('0')).toBeUndefined();
    expect(parseQuota('367')).toBeUndefined();
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('25,000')).toBe(25000);
    expect(parseAmount('1.5')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('10000001')).toBeNull();
  });
  it('works out the net of a payslip with new adjustments', () => {
    expect(slipNetWith({ gross: 30000, fixedDeduction: 1500, attendanceDeduction: 4000 }, 2000, 500)).toBe(26000);
    expect(slipNetWith({ gross: 30000, fixedDeduction: 1500, attendanceDeduction: 4000 }, 0, 40000)).toBeLessThan(0);
  });
  it('formats months and dates', () => {
    expect(periodLabel('2026-10', 'en')).toBe('October 2026');
    expect(currentPeriod(new Date(2026, 10, 4))).toBe('2026-11');
    expect(todayText(new Date(2026, 10, 4))).toBe('2026-11-04');
    expect(leaveTone('PENDING')).toBe('warning');
    expect(leaveTone('APPROVED')).toBe('success');
  });
});

describe('leave page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a teacher sees the balance and applies for leave', async () => {
    setup(teacher, <LeavePage />);
    expect(await screen.findByText('7 / 10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Requests' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apply for leave' }));
    await userEvent.selectOptions(await screen.findByLabelText('Leave type'), 't1');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(sent('POST', '/leave/requests')).toBeTruthy());
    expect(body('POST', '/leave/requests')).toEqual({ leaveTypeId: 't1', fromDate: todayText(), toDate: todayText(), reason: null });
  });

  it('an approver sees waiting requests and approves one', async () => {
    setup(approver, <LeavePage />);
    await tab('Leave sections', 'Requests');
    expect(await screen.findByText('Sara Khan')).toBeInTheDocument();
    expect(screen.getByText('Family wedding')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Note for the staff member'), 'Enjoy');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(sent('POST', '/leave/requests/r1/approve')).toBeTruthy());
    expect(body('POST', '/leave/requests/r1/approve')).toEqual({ note: 'Enjoy' });
  });
});

describe('payroll page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('HR opens a draft run, sees the figures and adds a bonus', async () => {
    setup(hr, <PayrollPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'October 2026' }));
    expect(await screen.findByText('Ahmed S')).toBeInTheDocument();
    expect(screen.getByText(/No payslip for these staff because no salary is set: Cara S/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(await screen.findByLabelText('Bonus'));
    await userEvent.type(screen.getByLabelText('Bonus'), '2000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('PATCH', '/payroll/payslips/s1')).toBeTruthy());
    expect(body('PATCH', '/payroll/payslips/s1')).toEqual({ bonus: 2000, otherDeduction: 0, note: null });
  });

  it('refuses a deduction bigger than the pay before sending anything', async () => {
    setup(hr, <PayrollPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'October 2026' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.clear(await screen.findByLabelText('Other deduction'));
    await userEvent.type(screen.getByLabelText('Other deduction'), '40000');
    expect(await screen.findByText('The deductions are more than the pay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(sent('PATCH', '/payroll/payslips/s1')).toBeUndefined();
  });

  it('an accountant pays a finalized payslip; HR cannot', async () => {
    setup(cashier, <PayrollPage />, 'FINALIZED');
    await userEvent.click(await screen.findByRole('button', { name: 'October 2026' }));
    expect(await screen.findByText('Ahmed S')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalize' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(sent('POST', '/payroll/payslips/s1/pay')).toBeTruthy());
    expect(body('POST', '/payroll/payslips/s1/pay')).toEqual({ method: 'CASH', paidOn: todayText() });
  });

  it('HR cannot see Pay buttons on a finalized run', async () => {
    setup(hr, <PayrollPage />, 'FINALIZED');
    await userEvent.click(await screen.findByRole('button', { name: 'October 2026' }));
    expect(await screen.findByText('Ahmed S')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('sets a salary for staff who have none', async () => {
    setup(hr, <PayrollPage />);
    await tab('Payroll sections', 'Salaries');
    expect(await screen.findByText('Not set')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set salary' }));
    await userEvent.type(await screen.findByLabelText('Basic salary'), '20,000');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('PUT', '/payroll/salaries/st9')).toBeTruthy());
    expect(body('PUT', '/payroll/salaries/st9')).toEqual({ basic: 20000, allowances: 0, fixedDeduction: 0, notes: null });
  });

  it('a read-only user sees no buttons that change things', async () => {
    setup(make(['payroll.read']), <PayrollPage />);
    expect(await screen.findByRole('button', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New payroll' })).not.toBeInTheDocument();
    await tab('Payroll sections', 'Salaries');
    expect(await screen.findByText('Ahmed S')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set salary' })).not.toBeInTheDocument();
  });
});

describe('my payslips', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('lists the signed-in staff member\'s payslips', async () => {
    setup(teacher, <MyPayslipsPage />);
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    expect(screen.getByText('P-000001')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});
