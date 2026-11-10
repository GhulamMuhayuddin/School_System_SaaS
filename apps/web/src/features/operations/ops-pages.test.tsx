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
import ComplaintsPage from '@/pages/complaints';
import VisitorsPage from '@/pages/visitors';
import { ageDays, durationText, nextStatuses, phoneOk, priorityTone, resolutionOk, statusTone } from './ops-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Front', lastName: 'Desk', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const desk = make(['visitor.read', 'visitor.manage', 'complaint.read', 'complaint.manage']);
const reader = make(['visitor.read', 'complaint.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const inside = { id: 'v1', visitNo: 'V-000001', name: 'Mrs Bano', phone: '0300-1234567', purpose: 'Meet class teacher', visiting: 'Class 5 teacher', student: null, notes: null, checkInAt: '2026-11-04T09:10:00Z', checkOutAt: null, minutes: null, inside: true };
const gone = { ...inside, id: 'v2', visitNo: 'V-000002', name: 'Mr Tariq', phone: null, purpose: 'Admission enquiry', visiting: 'Principal', checkOutAt: '2026-11-04T09:55:00Z', minutes: 45, inside: false };
const cmp = {
  id: 'c1', complaintNo: 'C-000001', source: 'PARENT', name: 'Mrs Aslam', phone: '0300-1234567', student: null, category: 'FEES', subject: 'Fee charged twice', details: 'October fee was taken two times.',
  priority: 'HIGH', status: 'OPEN', assignedTo: null, resolution: null, resolvedAt: null, createdAt: '2026-11-01T09:00:00Z',
};
const notes = [{ id: 'n1', kind: 'ASSIGN', text: 'Assigned to Sara K', by: 'Pri Ncipal', createdAt: '2026-11-02T09:00:00Z' }];

function setup(user: SessionUser, ui: React.ReactNode) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/visitors/summary')) return json(200, { today: 2, inside: 1 });
    if (url.includes('/visitors/visits/v1/checkout')) return json(200, { ...inside, inside: false });
    if (url.includes('/visitors/visits') && m === 'POST') return json(201, inside);
    if (url.includes('/visitors/visits')) return json(200, { visits: [inside, gone], truncated: false });
    if (url.endsWith('/complaints/summary')) return json(200, { open: 1, inProgress: 0, highActive: 1, resolved: 4 });
    if (url.includes('/complaints/c1/status')) return json(200, { complaint: { ...cmp, status: 'RESOLVED', resolution: 'Refunded' }, notes });
    if (url.includes('/complaints/c1/notes')) return json(201, { complaint: cmp, notes });
    if (url.includes('/complaints/c1/assign')) return json(200, { complaint: cmp, notes });
    if (url.includes('/complaints/c1')) return json(200, { complaint: cmp, notes });
    if (url.includes('/complaints') && m === 'POST') return json(201, { complaint: cmp, notes: [] });
    if (url.includes('/complaints')) return json(200, { complaints: [cmp], truncated: false });
    if (url.includes('/staff?')) return json(200, { staff: [{ id: 'sf1', firstName: 'Sara', lastName: 'K', employeeNo: 'E-1' }], total: 1 });
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

describe('operations helpers', () => {
  it('formats the time a visitor stayed', () => {
    expect(durationText(null)).toBe('');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(65)).toBe('1 h 05 min');
    expect(durationText(120)).toBe('2 h 00 min');
  });
  it('checks phone numbers like the server', () => {
    expect(phoneOk('')).toBe(true);
    expect(phoneOk('+92 300-1234567')).toBe(true);
    expect(phoneOk('(042) 111 222')).toBe(true);
    expect(phoneOk('call me')).toBe(false);
    expect(phoneOk('1'.repeat(31))).toBe(false);
  });
  it('knows which status may follow which, and that resolving needs words', () => {
    expect(nextStatuses('OPEN')).toEqual(['IN_PROGRESS', 'RESOLVED']);
    expect(nextStatuses('RESOLVED')).toEqual(['CLOSED', 'OPEN']);
    expect(nextStatuses('CLOSED')).toEqual(['OPEN']);
    expect(resolutionOk('ok')).toBe(false);
    expect(resolutionOk(' Refunded ')).toBe(true);
  });
  it('counts waiting days and picks colours', () => {
    expect(ageDays('2026-11-01T09:00:00Z', new Date('2026-11-04T08:00:00Z'))).toBe(2);
    expect(ageDays('2026-11-05T09:00:00Z', new Date('2026-11-04T08:00:00Z'))).toBe(0);
    expect(priorityTone('HIGH')).toBe('danger');
    expect(statusTone('RESOLVED')).toBe('success');
  });
});

describe('visitors page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows who is inside and who left, with the time they stayed', async () => {
    setup(desk, <VisitorsPage />);
    expect(await screen.findByRole('button', { name: 'Mrs Bano' })).toBeInTheDocument();
    expect(screen.getByText('Inside')).toBeInTheDocument();
    expect(screen.getByText(/\(45 min\)/)).toBeInTheDocument();
    expect(screen.getByText('To see: Principal')).toBeInTheDocument();
  });

  it('checks a visitor in', async () => {
    setup(desk, <VisitorsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check in a visitor' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Visitor name'), 'Mr Tariq');
    await userEvent.type(within(dialog).getByLabelText('Purpose of visit'), 'Admission enquiry');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(sent('POST', '/visitors/visits')).toBeTruthy());
    expect(body('POST', '/visitors/visits')).toEqual({ name: 'Mr Tariq', phone: null, purpose: 'Admission enquiry', visiting: null, notes: null });
  });

  it('refuses a bad phone number before sending', async () => {
    setup(desk, <VisitorsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check in a visitor' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Visitor name'), 'Mr Tariq');
    await userEvent.type(within(dialog).getByLabelText('Purpose of visit'), 'Admission enquiry');
    await userEvent.type(within(dialog).getByLabelText('Phone'), 'call me');
    expect(await within(dialog).findByText('Digits, spaces, + and - only')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Check in' })).toBeDisabled();
  });

  it('checks a visitor out', async () => {
    setup(desk, <VisitorsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check out' }));
    await waitFor(() => expect(sent('POST', '/visitors/visits/v1/checkout')).toBeTruthy());
  });

  it('a read-only user cannot check in or out', async () => {
    setup(reader, <VisitorsPage />);
    expect(await screen.findByText('Mrs Bano')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in a visitor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
  });
});

describe('complaints page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lists complaints with their priority, status and waiting time', async () => {
    setup(desk, <ComplaintsPage />);
    expect(await screen.findByRole('button', { name: 'Fee charged twice' })).toBeInTheDocument();
    expect(screen.getByText('High priority, not resolved')).toBeInTheDocument();
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
  });

  it('logs a complaint and opens it', async () => {
    setup(desk, <ComplaintsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Log a complaint' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name of complainant'), 'Mrs Aslam');
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'FEES');
    await userEvent.selectOptions(within(dialog).getByLabelText('Priority'), 'HIGH');
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'Fee charged twice');
    await userEvent.type(within(dialog).getByLabelText('Details'), 'October fee was taken two times.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log complaint' }));
    await waitFor(() => expect(sent('POST', '/complaints')).toBeTruthy());
    expect(body('POST', '/complaints')).toEqual({ source: 'PARENT', name: 'Mrs Aslam', phone: null, category: 'FEES', subject: 'Fee charged twice', details: 'October fee was taken two times.', priority: 'HIGH' });
    expect(await screen.findByText('Timeline')).toBeInTheDocument(); // opened the new complaint
  });

  it('resolving needs a written resolution', async () => {
    setup(desk, <ComplaintsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fee charged twice' }));
    expect(await screen.findByText('Assigned to Sara K')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Resolution'), 'Refunded');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(sent('POST', '/complaints/c1/status')).toBeTruthy());
    expect(body('POST', '/complaints/c1/status')).toEqual({ status: 'RESOLVED', resolution: 'Refunded' });
  });

  it('adds a follow-up note and assigns staff', async () => {
    setup(desk, <ComplaintsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fee charged twice' }));
    await userEvent.type(await screen.findByLabelText('Add a follow-up note'), 'Called the parent');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(sent('POST', '/complaints/c1/notes')).toBeTruthy());
    expect(body('POST', '/complaints/c1/notes')).toEqual({ text: 'Called the parent' });
    await userEvent.selectOptions(screen.getByLabelText('Assigned to'), 'sf1');
    await waitFor(() => expect(sent('POST', '/complaints/c1/assign')).toBeTruthy());
    expect(body('POST', '/complaints/c1/assign')).toEqual({ staffId: 'sf1' });
  });

  it('a read-only user can read the complaint but not change it', async () => {
    setup(reader, <ComplaintsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fee charged twice' }));
    expect(await screen.findByText('Assigned to Sara K')).toBeInTheDocument();
    for (const name of ['Mark resolved', 'Start working', 'Add note']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a follow-up note')).not.toBeInTheDocument();
  });
});
