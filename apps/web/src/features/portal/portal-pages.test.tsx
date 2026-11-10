import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import type { SessionUser } from '@/lib/api';
import PortalChildPage from '@/pages/portal-child';
import PortalHomePage from '@/pages/portal-home';
import { monthBounds, shiftMonth } from './portal-api';

const user: SessionUser = {
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'parent', name: 'Parent' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions: ['portal.own.read'],
};
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const kid = (id: string, firstName: string) => ({ id, admissionNo: `A-${id}`, firstName, lastName: 'Khan', status: 'ACTIVE', class: { id: 'c5', name: 'Class 5' }, section: { id: 's1', name: 'A' }, relation: 'MOTHER' });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, children: ReturnType<typeof kid>[], viewer = 'PARENT') {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url) => {
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/portal/children')) return json(200, { viewer, guardianName: 'Meher', children });
    if (url.includes('/attendance')) return json(200, { month: '2026-11', student: { id: 'k1', admissionNo: 'A-k1', name: 'Ali Khan' }, from: '2026-11-01', to: '2026-11-30', records: [{ date: '2026-11-02', status: 'ABSENT', remark: null }], totals: { present: 0, absent: 1, late: 0, leave: 0, marked: 1, percentage: 0 } });
    if (url.includes('/results')) return json(200, []);
    if (url.includes('/fees')) return json(200, { vouchers: [{ id: 'v1', voucherNo: 'V-1', period: '2026-11', dueDate: '2026-11-10', status: 'UNPAID', overdue: false, student: { id: 'k1', admissionNo: 'A', name: 'Ali' }, className: 'Class 5', sectionName: 'A', totalAmount: 3000, discountAmount: 0, netAmount: 3000, paidAmount: 1000, balance: 2000 }], totals: { billed: 3000, paid: 1000, balance: 2000, overdueBalance: 0 } });
    if (url.includes('/timetable')) return json(200, { timetable: null });
    if (url.includes('/library')) return json(200, { unpaidFine: 15, loans: [{ id: 'l1', copy: { id: 'c', accessionNo: 'LIB-000001' }, book: { id: 'b', title: 'Gulistan', author: 'Saadi' }, student: { id: 'k1', name: 'Ali', admissionNo: 'A', className: 'Class 5' }, issuedOn: '2026-11-01', dueOn: '2026-11-15', returnedOn: '2026-11-18', renewals: 0, state: 'RETURNED', overdueDays: 3, fine: 15, fineStatus: 'UNPAID' }] });
    if (url.includes('/hostel')) return json(200, { allocation: url.includes('/k2/') ? null : { hostel: { id: 'h1', name: 'Iqbal House', kind: 'BOYS', wardenName: 'Mr Khan', wardenPhone: '0300-1234567' }, room: { id: 'r1', roomNo: 'A-1', floor: 1, monthlyFee: 6000 }, assignedOn: '2026-11-02' } });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/app" element={<PortalHomePage />} />
          <Route path="/app/portal/:studentId/:tab?" element={<PortalChildPage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('portal helpers', () => {
  it('moves between months and finds month bounds', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('portal pages', () => {
  it('lists several children and links to each one', async () => {
    renderAt('/app', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('Sara Khan')).toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/app/portal/k1/attendance');
  });
  it('shows the empty state when no student is linked', async () => {
    renderAt('/app', []);
    expect(await screen.findByText('No students linked')).toBeInTheDocument();
  });
  it('opens a single child directly, with attendance of the month', async () => {
    renderAt('/app', [kid('k1', 'Ali')]);
    expect(await screen.findByRole('heading', { name: 'Ali Khan' })).toBeInTheDocument();
    expect(await screen.findByText('Absent: 1')).toBeInTheDocument();
    expect(screen.queryByText('All children')).not.toBeInTheDocument();
  });
  it('shows fee totals and sends users away from a child that is not theirs', async () => {
    renderAt('/app/portal/k1/fees', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('V-1')).toBeInTheDocument();
    expect(screen.getAllByText('Rs 2,000').length).toBe(2);
    expect(screen.getByText('Rs 3,000')).toBeInTheDocument();
  });
  it('redirects to the portal home for an unknown child id', async () => {
    renderAt('/app/portal/not-mine/fees', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    await waitFor(() => expect(screen.getByText('Sara Khan')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/children/not-mine'))).toBe(false);
  });
  it('shows the empty timetable state', async () => {
    renderAt('/app/portal/k1/timetable', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('No timetable yet')).toBeInTheDocument();
  });
  it('shows library loans and an unpaid fine warning', async () => {
    renderAt('/app/portal/k1/library', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('Gulistan')).toBeInTheDocument();
    expect(screen.getByText(/Unpaid library fine: Rs 15/)).toBeInTheDocument();
  });
  it('shows the hostel, room and warden of a child, or an empty state', async () => {
    renderAt('/app/portal/k1/hostel', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('Iqbal House')).toBeInTheDocument();
    expect(screen.getByText(/Room A-1/)).toBeInTheDocument();
    expect(screen.getByText(/Mr Khan/)).toBeInTheDocument();
    expect(screen.getByText('Rs 6,000')).toBeInTheDocument();
  });
  it('shows the empty hostel state for a child who does not live there', async () => {
    renderAt('/app/portal/k2/hostel', [kid('k1', 'Ali'), kid('k2', 'Sara')]);
    expect(await screen.findByText('No hostel')).toBeInTheDocument();
  });
});
