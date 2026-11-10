import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import AcademicSetupPage from '@/pages/academic-setup';
import TeachingAssignmentsPage from '@/pages/teaching-assignments';
import TimetablePage from '@/pages/timetable';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const admin = make(['academic.read', 'academic.manage', 'academic.timetable.manage', 'school.session.manage']);
const viewer = make(['academic.read']);

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const period1 = { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '08:40', sortOrder: 1, isBreak: false };
const brk = { id: 'p2', name: 'Interval', startTime: '08:40', endTime: '09:00', sortOrder: 2, isBreak: true };
const sectionRef = { id: 'sA', name: 'A', classId: 'c5', className: 'Class 5' };
const maths = { id: 'sub1', name: 'Mathematics' };
const classes = [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 0, sections: [{ id: 'sA', classId: 'c5', name: 'A', capacity: null, studentCount: 0 }] }];
const lesson = { id: 'e1', dayOfWeek: 1, period: period1, subject: maths, staff: { id: 't1', name: 'Sana Iqbal' }, room: 'R-4' };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser, myStatus = 200) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (m === 'POST' && url.endsWith('/timetable/assignments')) return json(201, { assignment: {} });
    if (m === 'PUT' && url.endsWith('/timetable/entries')) return json(200, { entry: lesson });
    if (url.endsWith('/academics/sessions')) return json(200, { sessions: [{ id: 'se1', name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true }] });
    if (url.endsWith('/academics/subjects')) return json(200, { subjects: [{ ...maths, code: 'MTH', classCount: 2 }] });
    if (url.endsWith('/academics/classes/c5/subjects')) return json(200, { classId: 'c5', subjects: [{ ...maths, code: 'MTH' }] });
    if (url.endsWith('/academics/classes')) return json(200, { classes });
    if (url.endsWith('/timetable/periods')) return json(200, { periods: [period1, brk] });
    if (url.endsWith('/timetable/teachers')) return json(200, { teachers: [{ id: 't1', name: 'Sana Iqbal', employeeNo: 'T-1' }] });
    if (url.includes('/timetable/assignments?')) return json(200, { assignments: [] });
    if (url.endsWith('/timetable/sections/sA')) return json(200, { session: { id: 'se1', name: '2026-2027' }, section: sectionRef, periods: [period1, brk], entries: [{ ...lesson, sectionId: 'sA' }] });
    if (url.endsWith('/timetable/my')) {
      return myStatus === 200
        ? json(200, { session: { id: 'se1', name: '2026-2027' }, staff: { id: 't1', name: 'Sana Iqbal' }, periods: [period1, brk], entries: [{ ...lesson, section: sectionRef }] })
        : json(404, { error: { code: 'NOT_FOUND', message: 'no profile' } });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/academics/setup" element={<AcademicSetupPage />} />
          <Route path="/app/academics/assignments" element={<TeachingAssignmentsPage />} />
          <Route path="/app/academics/timetable" element={<TimetablePage />} />
        </Routes>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, suffix: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).endsWith(suffix));

describe('academic setup page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lists sessions with the current one marked, and offers "Add session" only to session managers', async () => {
    const view = renderAt('/app/academics/setup', admin);
    expect(await screen.findByText('2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add session' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/academics/setup', viewer);
    expect(await screen.findByText('2026-2027')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add session' })).not.toBeInTheDocument();
  });

  it('shows subjects and periods on their tabs, with a break marked', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/setup', admin);
    await user.click(await screen.findByRole('tab', { name: 'Subjects' }));
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Taught in 2 classes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add subject' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Periods' }));
    expect(await screen.findByText('Period 1')).toBeInTheDocument();
    expect(screen.getByText('08:00 – 08:40')).toBeInTheDocument();
    expect(screen.getByText('Interval')).toBeInTheDocument();
    expect(screen.getByText('Break', { selector: 'span' })).toBeInTheDocument();
  });

  it('will not enable "Save" on the period form until the end time is after the start time', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/setup', admin);
    await user.click(await screen.findByRole('tab', { name: 'Periods' }));
    await user.click(await screen.findByRole('button', { name: 'Add period' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Period 2');
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: '09:00' } }); // time inputs are set directly: typing into them is unreliable in jsdom
    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: '08:00' } });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(dialog).getByText('The end time must be after the start time')).toBeInTheDocument();
  });
});

describe('teaching assignments page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lets an academic manager pick a teacher for a subject and sends the assignment', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/assignments', admin);
    const select = await screen.findByLabelText('Teacher: Mathematics');
    expect(screen.getByText('No teacher assigned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
    await user.selectOptions(select, 'Sana Iqbal (T-1)');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(sent('POST', '/timetable/assignments')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/timetable/assignments')?.[1]?.body))).toEqual({ sectionId: 'sA', subjectId: 'sub1', staffId: 't1' });
  });

  it('is read-only for users who cannot manage academics', async () => {
    renderAt('/app/academics/assignments', viewer);
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.queryByLabelText('Teacher: Mathematics')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
  });
});

describe('timetable page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lets a planner open a cell, choose a subject and save the lesson', async () => {
    const user = userEvent.setup();
    renderAt('/app/academics/timetable', admin);
    expect(await screen.findByText('Mathematics')).toBeInTheDocument(); // the existing Monday lesson
    expect(screen.getByText('Sana Iqbal · R-4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tuesday, Period 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save lesson' })).toBeDisabled();
    await user.selectOptions(await within(dialog).findByLabelText('Subject'), 'Mathematics');
    await user.click(within(dialog).getByRole('button', { name: 'Save lesson' }));
    await waitFor(() => expect(sent('PUT', '/timetable/entries')).toBeTruthy());
    expect(JSON.parse(String(sent('PUT', '/timetable/entries')?.[1]?.body))).toEqual({ sectionId: 'sA', dayOfWeek: 2, periodId: 'p1', subjectId: 'sub1', room: null });
  });

  it('shows a viewer their own timetable read-only, without any editing buttons', async () => {
    renderAt('/app/academics/timetable', viewer);
    expect(await screen.findByText('Class 5-A · R-4')).toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Period 1/ })).not.toBeInTheDocument();
    expect(screen.getByText('Interval', { selector: 'span' })).toBeInTheDocument();
  });

  it('says so when the login is not linked to a staff profile', async () => {
    renderAt('/app/academics/timetable', viewer, 404);
    expect(await screen.findByText('Your login is not linked to a staff profile, so there is no personal timetable.')).toBeInTheDocument();
  });
});
