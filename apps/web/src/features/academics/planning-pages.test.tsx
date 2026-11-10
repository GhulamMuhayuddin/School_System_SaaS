import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import AcademicCalendarPage from '@/pages/academic-calendar';
import SyllabusPage from '@/pages/syllabus';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const manager = make(['academic.read', 'academic.manage']);
const viewer = make(['academic.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const today = new Date().toISOString().slice(0, 10);
const tenth = `${today.slice(0, 8)}10`; // the 10th of the current month is always on the grid
const twelfth = `${today.slice(0, 8)}12`;
const monthTitle = (offset: number) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1)));

const events = [{ id: 'ev1', title: 'Eid break', type: 'HOLIDAY', startDate: tenth, endDate: twelfth, description: 'School closed' }];
const classes = [{ id: 'c6', name: 'Class 6', level: 6, studentCount: 0, sections: [] }];
const topics = [
  { id: 't1', title: 'Whole numbers', description: null, sortOrder: 1, status: 'COMPLETED', completedAt: '2026-04-20T09:00:00.000Z' },
  { id: 't2', title: 'Fractions', description: 'Add and subtract', sortOrder: 2, status: 'IN_PROGRESS', completedAt: null },
  { id: 't3', title: 'Decimals', description: null, sortOrder: 3, status: 'PLANNED', completedAt: null },
];
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (m === 'POST' && url.endsWith('/calendar/events')) return json(201, { event: events[0] });
    if (m === 'POST' && url.endsWith('/syllabus/topics')) return json(201, { topic: topics[0] });
    if (m === 'POST' && url.endsWith('/status')) return json(200, { topic: topics[0] });
    if (m === 'POST' && url.endsWith('/move')) return json(200, { topics });
    if (url.includes('/calendar/events?')) return json(200, { events });
    if (url.endsWith('/academics/classes/c6/subjects')) return json(200, { classId: 'c6', subjects: [{ id: 'm', name: 'Mathematics', code: null }, { id: 'e', name: 'English', code: null }] });
    if (url.endsWith('/academics/classes')) return json(200, { classes });
    if (url.includes('/syllabus/summary?')) {
      return json(200, { session: { id: 'se', name: '2026-2027' }, classId: 'c6', subjects: [
        { subject: { id: 'm', name: 'Mathematics' }, progress: { total: 3, completed: 1, inProgress: 1 } },
        { subject: { id: 'e', name: 'English' }, progress: { total: 0, completed: 0, inProgress: 0 } },
      ] });
    }
    if (url.includes('/syllabus/topics?')) return json(200, { session: { id: 'se', name: '2026-2027' }, classId: 'c6', subject: { id: 'm', name: 'Mathematics' }, topics, progress: { total: 3, completed: 1, inProgress: 1 } });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/academics/calendar" element={<AcademicCalendarPage />} />
          <Route path="/app/academics/syllabus" element={<SyllabusPage />} />
        </Routes>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, suffix: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).endsWith(suffix));
const bodyOf = (method: string, suffix: string) => JSON.parse(String(sent(method, suffix)?.[1]?.body));

describe('academic calendar page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('shows the current month with its events, and lets a manager add one', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/calendar', manager);
    expect(await screen.findByRole('heading', { name: monthTitle(0) })).toBeInTheDocument();
    expect((await screen.findAllByText('Eid break')).length).toBeGreaterThanOrEqual(2); // on the grid and in the month list
    expect(screen.getByText('School closed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save event' })).toBeDisabled(); // needs a title
    await user.type(within(dialog).getByLabelText('Title'), 'Sports day');
    await user.click(within(dialog).getByRole('button', { name: 'Save event' }));
    await waitFor(() => expect(sent('POST', '/calendar/events')).toBeTruthy());
    expect(bodyOf('POST', '/calendar/events')).toMatchObject({ title: 'Sports day', type: 'EVENT', startDate: today, description: null });
  });

  it('is read-only for users who cannot manage academics', async () => {
    renderAt('/app/academics/calendar', viewer);
    expect((await screen.findAllByText('Eid break')).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Add event' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eid break' })).not.toBeInTheDocument(); // chips are not clickable
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('moves between months and asks the server for the new range', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/calendar', viewer);
    await screen.findByRole('heading', { name: monthTitle(0) });
    const before = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/calendar/events?')).length;
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByRole('heading', { name: monthTitle(1) })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/calendar/events?')).length).toBeGreaterThan(before));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('heading', { name: monthTitle(0) })).toBeInTheDocument();
  });
});

describe('syllabus page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('shows subject progress and the topics in order', async () => {
    renderAt('/app/academics/syllabus', manager);
    expect(await screen.findByText('Whole numbers')).toBeInTheDocument();
    expect(screen.getByText('Fractions')).toBeInTheDocument();
    expect(screen.getByText('Decimals')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument(); // Maths card
    expect(screen.getByText('0/0')).toBeInTheDocument(); // English card, no topics yet
    expect(screen.getByText(/1 of 3 topics completed/)).toBeInTheDocument();
    expect(screen.getByText(/Completed on/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up: Whole numbers' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: Decimals' })).toBeDisabled();
  });

  it('lets a manager change a status, move a topic and add a topic', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/syllabus', manager);
    await screen.findByText('Whole numbers');

    await user.selectOptions(screen.getByLabelText('Status: Decimals'), 'Completed');
    await waitFor(() => expect(sent('POST', '/syllabus/topics/t3/status')).toBeTruthy());
    expect(bodyOf('POST', '/syllabus/topics/t3/status')).toEqual({ status: 'COMPLETED' });

    await user.click(screen.getByRole('button', { name: 'Move down: Whole numbers' }));
    await waitFor(() => expect(sent('POST', '/syllabus/topics/t1/move')).toBeTruthy());
    expect(bodyOf('POST', '/syllabus/topics/t1/move')).toEqual({ direction: 'down' });

    await user.click(screen.getByRole('button', { name: 'Add topic' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Topic title'), 'Geometry');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/syllabus/topics')).toBeTruthy());
    expect(bodyOf('POST', '/syllabus/topics')).toEqual({ classId: 'c6', subjectId: 'm', title: 'Geometry', description: null });
  });

  it('shows plain status badges and no editing controls to read-only users', async () => {
    renderAt('/app/academics/syllabus', viewer);
    expect(await screen.findByText('Whole numbers')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.queryByLabelText('Status: Decimals')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move down/ })).not.toBeInTheDocument();
  });
});
