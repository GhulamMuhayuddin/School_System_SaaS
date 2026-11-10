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
import HostelPage from '@/pages/hostel';
import { bedTone, freeBeds, genderFits, parseBeds, parseFloorNo } from './hostel-api';
import { StudentHostelCard } from './student-hostel-card';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Hosta', lastName: 'Warden', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const manager = make(['hostel.read', 'hostel.manage', 'student.read']);
const viewer = make(['hostel.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const hostel = { id: 'h1', name: 'Iqbal House', kind: 'BOYS', wardenName: 'Mr Khan', wardenPhone: '0300-1234567', notes: null, active: true, rooms: 2, beds: 5, residents: 3, income: 12000 };
const room = { id: 'r1', hostelId: 'h1', hostelName: 'Iqbal House', hostelKind: 'BOYS', roomNo: 'A-1', floor: 1, beds: 4, monthlyFee: 6000, notes: null, active: true, residents: 2, bedState: 'FREE', income: 12000 };
const resident = { student: { id: 's1', name: 'Ali Khan', admissionNo: 'A-1', className: 'Class 9' }, hostel: { id: 'h1', name: 'Iqbal House' }, room: { id: 'r1', roomNo: 'A-1' }, assignedOn: '2026-11-02' };
const allocation = { hostel: { id: 'h1', name: 'Iqbal House', kind: 'BOYS', wardenName: 'Mr Khan', wardenPhone: '0300-1234567' }, room: { id: 'r1', roomNo: 'A-1', floor: 1, monthlyFee: 6000 }, assignedOn: '2026-11-02' };
const summary = { hostels: 1, rooms: 2, beds: 5, residents: 3, freeBeds: 2, monthlyIncome: 12000, overCapacity: 0 };

function setup(user: SessionUser, ui: React.ReactNode) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/hostel/summary')) return json(200, summary);
    if (url.includes('/hostel/students/s1') && m === 'GET') return json(200, { allocation });
    if (url.includes('/hostel/students/') && m === 'PUT') return json(200, allocation);
    if (url.includes('/hostel/students/') && m === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/hostel/hostels') && m === 'POST') return json(201, hostel);
    if (url.includes('/hostel/hostels')) return json(200, [hostel]);
    if (url.includes('/hostel/rooms') && m === 'POST') return json(201, room);
    if (url.includes('/hostel/rooms')) return json(200, [room]);
    if (url.includes('/hostel/residents')) return json(200, { residents: [resident], truncated: false });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/hostel']}><Suspense fallback={null}>
        <Routes><Route path="/app/hostel" element={ui} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const tab = async (name: string) => userEvent.click(within(await screen.findByRole('navigation', { name: 'Hostel sections' })).getByRole('button', { name }));

describe('hostel helpers', () => {
  it('checks beds, floors and who fits where like the server', () => {
    expect(parseBeds('4')).toBe(4);
    expect(parseBeds('40')).toBe(40);
    expect(parseBeds('0')).toBeNull();
    expect(parseBeds('41')).toBeNull();
    expect(parseBeds('2.5')).toBeNull();
    expect(parseFloorNo('')).toBeUndefined();
    expect(parseFloorNo('-1')).toBe(-1);
    expect(parseFloorNo('51')).toBeNull();
    expect(parseFloorNo('two')).toBeNull();
    expect(genderFits('BOYS', 'MALE')).toBe(true);
    expect(genderFits('BOYS', 'FEMALE')).toBe(false);
    expect(genderFits('MIXED', 'OTHER')).toBe(true);
  });
  it('colours rooms and counts free beds', () => {
    expect(bedTone('FREE')).toBe('success');
    expect(bedTone('FULL')).toBe('warning');
    expect(bedTone('OVER')).toBe('danger');
    expect(freeBeds({ beds: 4, residents: 3 })).toBe(1);
    expect(freeBeds({ beds: 4, residents: 6 })).toBe(0);
  });
});

describe('hostel page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows the summary and hostels with warden and residents', async () => {
    setup(manager, <HostelPage />);
    expect(await screen.findByRole('button', { name: 'Iqbal House' })).toBeInTheDocument();
    expect(await screen.findByText('Free beds')).toBeInTheDocument();
    expect(screen.getByText('Mr Khan')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText('Boys')).toBeInTheDocument();
  });

  it('adds a room with beds and a fee', async () => {
    setup(manager, <HostelPage />);
    await tab('Rooms');
    await userEvent.click(await screen.findByRole('button', { name: 'Add room' }));
    await userEvent.selectOptions(await screen.findByLabelText('Hostel', { selector: '#rm-hostel' }), 'h1');
    await userEvent.type(screen.getByLabelText('Room number'), 'B-2');
    await userEvent.type(screen.getByLabelText('Beds'), '0');
    expect(await screen.findByText('Between 1 and 40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Beds'));
    await userEvent.type(screen.getByLabelText('Beds'), '3');
    await userEvent.type(screen.getByLabelText('Monthly fee per bed (Rs)'), '4,500');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/hostel/rooms')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/hostel/rooms')![1]!.body))).toEqual({ hostelId: 'h1', roomNo: 'B-2', floor: null, beds: 3, monthlyFee: 4500, notes: null });
  });

  it('adds a hostel of a chosen type', async () => {
    setup(manager, <HostelPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add hostel' }));
    await userEvent.type(await screen.findByLabelText('Hostel name'), 'Fatima House');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'GIRLS');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/hostel/hostels')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/hostel/hostels')![1]!.body))).toEqual({ name: 'Fatima House', kind: 'GIRLS', wardenName: null, wardenPhone: null, notes: null });
  });

  it('lists residents and removes one', async () => {
    setup(manager, <HostelPage />);
    await tab('Residents');
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove from hostel' }));
    await waitFor(() => expect(sent('DELETE', '/hostel/students/s1')).toBeTruthy());
  });

  it('a read-only user sees no add, edit or remove buttons', async () => {
    setup(viewer, <HostelPage />);
    expect(await screen.findByText('Iqbal House')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add hostel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iqbal House' })).toBeNull();
    await tab('Rooms');
    await screen.findByText('A-1');
    expect(screen.queryByRole('button', { name: 'Add room' })).toBeNull();
    await tab('Residents');
    await screen.findByText('Ali Khan');
    expect(screen.queryByRole('button', { name: 'Remove from hostel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move into room' })).toBeNull();
  });
});

describe('student hostel card', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows hostel, room, warden and fee, and lets a manager change it', async () => {
    setup(manager, <StudentHostelCard studentId="s1" studentName="Ali Khan" />);
    expect(await screen.findByText('Iqbal House')).toBeInTheDocument();
    expect(screen.getByText(/Room A-1/)).toBeInTheDocument();
    expect(screen.getByText(/Mr Khan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('read-only users cannot change it', async () => {
    setup(viewer, <StudentHostelCard studentId="s1" studentName="Ali Khan" />);
    await screen.findByText('Iqbal House');
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from hostel' })).toBeNull();
  });
});
