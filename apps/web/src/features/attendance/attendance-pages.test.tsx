import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import { StudentAttendanceCard } from '@/features/attendance/student-attendance-card';
import AttendanceMarkPage from '@/pages/attendance-mark';
import AttendanceMonthlyPage from '@/pages/attendance-monthly';
import AttendanceReportPage from '@/pages/attendance-report';
import StaffAttendancePage from '@/pages/staff-attendance';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const teacher = make(['attendance.read', 'attendance.mark', 'academic.read']);
const viewer = make(['attendance.read', 'academic.read']);
const hr = make(['staff.attendance']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const section = { id: 'sA', name: 'A', classId: 'c5', className: 'Class 5' };
const classes = [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 2, sections: [{ id: 'sA', classId: 'c5', name: 'A', capacity: 30, studentCount: 2 }] }];
const baseRoster = {
  date: '2026-11-04', today: '2026-11-04', section, holiday: null, marked: false, access: { canMark: true, reason: null },
  students: [
    { id: 'st1', admissionNo: '0001', name: 'Ali Khan', status: null, remark: null },
    { id: 'st2', admissionNo: '0002', name: 'Sara Noor', status: null, remark: null },
  ],
};
const totals = { present: 8, absent: 1, late: 1, leave: 0, marked: 10, percentage: 90 };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser, roster: object = baseRoster) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/academics/classes')) return json(200, { classes });
    if (url.includes('/attendance/students/sections/sA/monthly')) {
      return json(200, { month: '2026-11', days: 30, holidays: ['2026-11-09'], section, students: [{ id: 'st1', admissionNo: '0001', name: 'Ali Khan', records: { '2026-11-02': 'PRESENT', '2026-11-03': 'ABSENT' }, totals }] });
    }
    if (url.includes('/attendance/students/sections/sA') && m === 'PUT') return json(200, { ...roster, marked: true });
    if (url.includes('/attendance/students/sections/sA')) return json(200, roster);
    if (url.includes('/attendance/students/st1/history')) {
      return json(200, { student: { id: 'st1', admissionNo: '0001', name: 'Ali Khan' }, from: '2026-10-06', to: '2026-11-04', records: [{ date: '2026-11-03', status: 'ABSENT', remark: null }], totals });
    }
    if (url.includes('/attendance/reports/students')) {
      return json(200, { from: '2026-11-01', to: '2026-11-04', total: 1, rows: [{ student: { id: 'st1', admissionNo: '0001', name: 'Ali Khan', className: 'Class 5', sectionName: 'A' }, totals: { ...totals, percentage: 40 } }] });
    }
    if (url.includes('/attendance/staff') && m === 'PUT') return json(200, { date: '2026-11-04', today: '2026-11-04', holiday: null, marked: true, staff: [] });
    if (url.includes('/attendance/staff')) {
      return json(200, { date: '2026-11-04', today: '2026-11-04', holiday: null, marked: false, staff: [{ id: 'f1', employeeNo: 'E-001', name: 'Sana Iqbal', designation: 'Maths Teacher', status: null, remark: null }] });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/card" element={<StudentAttendanceCard studentId="st1" />} />
          <Route path="/app/attendance" element={<AttendanceMarkPage />} />
          <Route path="/app/attendance/monthly" element={<AttendanceMonthlyPage />} />
          <Route path="/app/attendance/report" element={<AttendanceReportPage />} />
          <Route path="/app/attendance/staff" element={<StaffAttendancePage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));

describe('attendance pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('only allows saving when everyone is marked, then sends the whole roster', async () => {
    const user = userEvent.setup();
    renderAt('/app/attendance', teacher);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save attendance' });
    expect(save).toBeDisabled();
    expect(screen.getByText('Mark every student before saving.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ali Khan: Present' }));
    expect(save).toBeDisabled(); // Sara is still unmarked
    await user.click(screen.getByRole('button', { name: 'Sara Noor: Absent' }));
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(sent('PUT', '/attendance/students/sections/sA')).toBeTruthy());
    expect(JSON.parse(String(sent('PUT', '/attendance/students/sections/sA')![1]!.body))).toEqual({
      date: '2026-11-04', entries: [{ studentId: 'st1', status: 'PRESENT', remark: null }, { studentId: 'st2', status: 'ABSENT', remark: null }],
    });
  });

  it('"Mark all present" fills the roster so one tap is enough', async () => {
    const user = userEvent.setup();
    renderAt('/app/attendance', teacher);
    await screen.findByText('Ali Khan');
    await user.click(screen.getByRole('button', { name: 'Mark all present' }));
    expect(screen.getByRole('button', { name: 'Ali Khan: Present' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Save attendance' })).toBeEnabled();
  });

  it('shows a holiday as a notice and makes the roster read-only', async () => {
    renderAt('/app/attendance', teacher, { ...baseRoster, holiday: { title: 'Eid' }, access: { canMark: false, reason: 'HOLIDAY' } });
    expect(await screen.findByText('Eid is a holiday. Attendance cannot be marked.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ali Khan: Present' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all present' })).not.toBeInTheDocument();
  });

  it('explains why a teacher cannot mark someone else\'s section, and is read-only without attendance.mark', async () => {
    const view = renderAt('/app/attendance', teacher, { ...baseRoster, access: { canMark: false, reason: 'NOT_YOUR_SECTION' } });
    expect(await screen.findByText(/not assigned to this section/)).toBeInTheDocument();
    view.unmount();
    renderAt('/app/attendance', viewer);
    await screen.findByText('Ali Khan');
    expect(screen.getByRole('button', { name: 'Ali Khan: Present' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).not.toBeInTheDocument();
  });

  it('shows the month sheet with each student\'s percentage; tabs follow permissions', async () => {
    renderAt('/app/attendance/monthly', viewer);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByLabelText('3: Absent')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Attendance' });
    expect(within(nav).getByText('Low attendance')).toBeInTheDocument();
    expect(within(nav).queryByText('Staff')).not.toBeInTheDocument();
  });

  it('lists low-attendance students using the chosen limit', async () => {
    renderAt('/app/attendance/report', viewer);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    const call = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/attendance/reports/students'));
    expect(call).toContain('below=75');
  });

  it('shows a student\'s last 30 days on the student page card', async () => {
    renderAt('/card', viewer);
    expect(await screen.findByText('90%')).toBeInTheDocument();
    expect(screen.getByText(/Recent absences/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/attendance/students/st1/history?from='))).toBe(true);
  });

  it('marks staff attendance for HR', async () => {
    const user = userEvent.setup();
    renderAt('/app/attendance/staff', hr);
    expect(await screen.findByText('Sana Iqbal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sana Iqbal: Late' }));
    await user.click(screen.getByRole('button', { name: 'Save attendance' }));
    await waitFor(() => expect(sent('PUT', '/attendance/staff')).toBeTruthy());
    expect(JSON.parse(String(sent('PUT', '/attendance/staff')![1]!.body))).toEqual({ date: '2026-11-04', entries: [{ staffId: 'f1', status: 'LATE', remark: null }] });
  });
});
