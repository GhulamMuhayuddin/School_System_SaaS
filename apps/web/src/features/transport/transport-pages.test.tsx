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
import TransportPage from '@/pages/transport';
import { StudentTransportCard } from './student-transport-card';
import { firstOutOfOrder, parseFee, seatTone, validTime } from './transport-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Tara', lastName: 'Nsport', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const manager = make(['transport.read', 'transport.manage', 'student.read']);
const viewer = make(['transport.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const vehicle = { id: 'v1', registrationNo: 'ABC-100', kind: 'Bus', capacity: 30, driverName: 'Rafiq', driverPhone: '0300-1234567', notes: null, active: true, routes: [{ id: 'r1', name: 'North' }], riders: 2 };
const route = {
  id: 'r1', name: 'North', monthlyFee: 2500, notes: null, active: true, riders: 2, seat: 'FREE', income: 5000,
  vehicle: { id: 'v1', registrationNo: 'ABC-100', capacity: 30, driverName: 'Rafiq', driverPhone: '0300-1234567' },
  stops: [{ id: 'p1', name: 'Gate', sequence: 1, pickupTime: '07:00', riders: 1 }, { id: 'p2', name: 'Market', sequence: 2, pickupTime: '07:15', riders: 1 }],
};
const rider = { student: { id: 's1', name: 'Ali Khan', admissionNo: 'A-1', className: 'Class 5' }, route: { id: 'r1', name: 'North' }, stop: { id: 'p1', name: 'Gate' }, assignedOn: '2026-11-02' };
const assignment = { route: { id: 'r1', name: 'North', monthlyFee: 2500 }, stop: { id: 'p1', name: 'Gate', pickupTime: '07:00' }, vehicle: { registrationNo: 'ABC-100', kind: 'Bus', driverName: 'Rafiq', driverPhone: '0300-1234567' }, assignedOn: '2026-11-02' };
const summary = { routes: 1, vehicles: 1, riders: 2, monthlyIncome: 5000, routesWithoutVehicle: 0, overCapacity: 0 };

function setup(user: SessionUser, ui: React.ReactNode, path: string) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/transport/summary')) return json(200, summary);
    if (url.includes('/transport/students/s1') && m === 'GET') return json(200, { assignment });
    if (url.includes('/transport/students/') && m === 'PUT') return json(200, assignment);
    if (url.includes('/transport/students/') && m === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/transport/routes') && m === 'POST') return json(201, route);
    if (url.includes('/transport/routes')) return json(200, [route]);
    if (url.includes('/transport/vehicles') && m === 'POST') return json(201, vehicle);
    if (url.includes('/transport/vehicles')) return json(200, [vehicle]);
    if (url.includes('/transport/riders')) return json(200, { riders: [rider], truncated: false });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes><Route path="/app/transport" element={ui} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));

describe('transport helpers', () => {
  it('validates times and order like the server', () => {
    expect(validTime('07:05')).toBe(true);
    expect(validTime('7:05')).toBe(false);
    expect(validTime('24:00')).toBe(false);
    expect(firstOutOfOrder(['07:00', '07:15'])).toBeNull();
    expect(firstOutOfOrder(['07:30', null, '07:10'])).toBe(3);
  });
  it('parses fees and colours seats', () => {
    expect(parseFee('2,500')).toBe(2500);
    expect(parseFee('')).toBe(0);
    expect(parseFee('12.5')).toBeNull();
    expect(parseFee('-5')).toBeNull();
    expect(parseFee('2000000')).toBeNull();
    expect(seatTone('FREE')).toBe('success');
    expect(seatTone('OVER')).toBe('danger');
    expect(seatTone('NO_VEHICLE')).toBe('neutral');
  });
});

describe('transport page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows summary and routes with seats and fee', async () => {
    setup(manager, <TransportPage />, '/app/transport');
    expect(await screen.findByRole('button', { name: 'North' })).toBeInTheDocument();
    expect(await screen.findByText('Expected monthly fees')).toBeInTheDocument();
    expect(screen.getByText('Gate 07:00 → Market 07:15')).toBeInTheDocument();
    expect(screen.getByText('2 / 30')).toBeInTheDocument();
  });

  it('adds a route with stops and blocks times that go backwards', async () => {
    setup(manager, <TransportPage />, '/app/transport');
    await userEvent.click(await screen.findByRole('button', { name: 'Add route' }));
    await userEvent.type(await screen.findByLabelText('Route name'), 'South');
    const names = screen.getAllByLabelText('Stop name');
    await userEvent.type(names[0]!, 'Canal');
    await userEvent.type(screen.getAllByLabelText('Pickup time')[0]!, '07:30');
    await userEvent.click(screen.getByRole('button', { name: 'Add stop' }));
    await userEvent.type(screen.getAllByLabelText('Stop name')[1]!, 'Park');
    await userEvent.type(screen.getAllByLabelText('Pickup time')[1]!, '07:10');
    expect(await screen.findByText('Pickup times must not go backwards along the route.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(screen.getAllByLabelText('Pickup time')[1]!);
    await userEvent.type(screen.getAllByLabelText('Pickup time')[1]!, '07:45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/transport/routes')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/transport/routes')![1]!.body))).toEqual({
      name: 'South', monthlyFee: 0, vehicleId: null, notes: null, stops: [{ name: 'Canal', pickupTime: '07:30' }, { name: 'Park', pickupTime: '07:45' }],
    });
  });

  it('lists riders and removes one', async () => {
    setup(manager, <TransportPage />, '/app/transport');
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Transport sections' })).getByRole('button', { name: 'Riders' }));
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove from transport' }));
    await waitFor(() => expect(sent('DELETE', '/transport/students/s1')).toBeTruthy());
  });

  it('a read-only user sees no add or remove buttons', async () => {
    setup(viewer, <TransportPage />, '/app/transport');
    expect(await screen.findByText('North')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add route' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'North' })).toBeNull();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Transport sections' })).getByRole('button', { name: 'Riders' }));
    await screen.findByText('Ali Khan');
    expect(screen.queryByRole('button', { name: 'Remove from transport' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Put on route' })).toBeNull();
  });
});

describe('student transport card', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows route, stop, pickup time and driver, and lets a manager change it', async () => {
    setup(manager, <StudentTransportCard studentId="s1" studentName="Ali Khan" />, '/app/transport');
    expect(await screen.findByText(/Gate/)).toBeInTheDocument();
    expect(screen.getByText(/pickup 07:00/)).toBeInTheDocument();
    expect(screen.getByText(/Rafiq/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('read-only users cannot change it', async () => {
    setup(viewer, <StudentTransportCard studentId="s1" studentName="Ali Khan" />, '/app/transport');
    await screen.findByText(/Gate/);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from transport' })).toBeNull();
  });
});
