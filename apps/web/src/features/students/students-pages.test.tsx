import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import ClassesPage from '@/pages/classes';
import StudentDetailPage from '@/pages/student-detail';
import StudentNewPage from '@/pages/student-new';
import StudentsListPage from '@/pages/students-list';

const CLASS = '33333333-3333-4333-8333-333333333333';
const SEC = '44444444-4444-4444-8444-444444444444';
const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'school_admin', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const admin = make(['student.read', 'student.create', 'student.update', 'student.delete', 'student.withdraw', 'academic.read', 'academic.manage']);
const teacher = make(['student.read', 'academic.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const guardian = { linkId: 'l1', guardianId: 'g1', name: 'Ahmed Khan', phone: '0300-1234567', email: null, occupation: null, address: null, relation: 'FATHER', isPrimary: true };
const row = { id: 's9', admissionNo: '0001', firstName: 'Ali', lastName: 'Khan', gender: 'MALE', status: 'ACTIVE', class: { id: CLASS, name: 'Class 1' }, section: { id: SEC, name: 'A' }, primaryGuardian: { name: 'Ahmed Khan', phone: '0300-1234567' } };
const detail = { ...row, dateOfBirth: '2015-05-20', bloodGroup: null, phone: null, address: null, previousSchool: null, notes: null, admissionDate: '2026-04-01', leftAt: null, leftReason: null, createdAt: '2026-10-01T00:00:00Z', guardians: [guardian], siblings: [] };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser, classes = [{ id: CLASS, name: 'Class 1', level: 1, sections: [{ id: SEC, name: 'A', capacity: 30 }] }]) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/students/options')) return json(200, { options: { classes } });
    if (url.endsWith('/students/s9') && m === 'GET') return json(200, { student: detail });
    if (url.endsWith('/students') && m === 'POST') return json(201, { student: detail });
    if (url.includes('/students?')) return json(200, { students: [row], total: 1 });
    if (url.endsWith('/academics/classes')) return json(200, { classes: [{ id: CLASS, name: 'Class 1', level: 1, studentCount: 1, sections: [{ id: SEC, classId: CLASS, name: 'A', capacity: 30, studentCount: 1 }] }] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/students" element={<StudentsListPage />} />
          <Route path="/app/students/new" element={<StudentNewPage />} />
          <Route path="/app/students/:id" element={<StudentDetailPage />} />
          <Route path="/app/academics/classes" element={<ClassesPage />} />
        </Routes>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}

describe('students pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lists students and shows "Add student" only to users who may create', async () => {
    const view = renderAt('/app/students', admin);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add student' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/students', teacher);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument();
  });

  it('validates the enrolment form, then sends the student with the chosen primary guardian', async () => {
    const user = userEvent.setup();
    renderAt('/app/students/new', admin);
    await screen.findByRole('heading', { name: 'Add student' });
    await user.click(screen.getByRole('button', { name: 'Enrol student' }));
    expect((await screen.findAllByText('This field is required')).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/students'))).toBe(false);

    await user.type(screen.getByLabelText('First name'), 'Ali');
    await user.type(screen.getByLabelText('Last name'), 'Khan');
    await user.type(screen.getByLabelText('Date of birth'), '2015-05-20');
    await screen.findByRole('option', { name: 'Class 1' });
    await user.selectOptions(screen.getByLabelText('Class'), CLASS);
    await user.selectOptions(screen.getByLabelText('Section'), SEC);
    await user.type(screen.getByLabelText('Name', { selector: '#g0-name' }), 'Ahmed Khan');
    await user.type(screen.getByLabelText('Phone', { selector: '#g0-phone' }), '0300-1234567');
    await user.click(screen.getByRole('button', { name: 'Add guardian' }));
    await user.type(screen.getByLabelText('Name', { selector: '#g1-name' }), 'Fatima Khan');
    await user.type(screen.getByLabelText('Phone', { selector: '#g1-phone' }), '0301-7654321');
    await user.click(screen.getAllByRole('radio')[1]);
    await user.click(screen.getByRole('button', { name: 'Enrol student' }));

    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/students'))).toBe(true));
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/students'))!;
    const body = JSON.parse(String(post[1]!.body));
    expect(body).toMatchObject({ firstName: 'Ali', classId: CLASS, sectionId: SEC, dateOfBirth: '2015-05-20' });
    expect(body.guardians.map((g: { name: string; isPrimary: boolean }) => [g.name, g.isPrimary])).toEqual([['Ahmed Khan', false], ['Fatima Khan', true]]);
    expect(body.admissionNo).toBeUndefined();
  });

  it('warns when there are no classes yet', async () => {
    renderAt('/app/students/new', admin, []);
    expect(await screen.findByText(/no classes yet/i)).toBeInTheDocument();
  });

  it('shows student details with guardians; teacher sees no edit or delete', async () => {
    const view = renderAt('/app/students/s9', admin);
    expect(await screen.findByRole('heading', { name: /Ali Khan/ })).toBeInTheDocument();
    expect(screen.getByText('Ahmed Khan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/students/s9', teacher);
    expect(await screen.findByRole('heading', { name: /Ali Khan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows classes with sections; management buttons only with academic.manage', async () => {
    const view = renderAt('/app/academics/classes', admin);
    expect(await screen.findByText('Class 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add class' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/academics/classes', teacher);
    expect(await screen.findByText('Class 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add class' })).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
