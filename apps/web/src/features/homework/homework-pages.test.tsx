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
import HomeworkDetailPage from '@/pages/homework-detail';
import HomeworkListPage from '@/pages/homework-list';
import { ChildHomeworkList } from './child-homework';
import { changedEntries, draftOf, parseMarks, stateTone, statusTone, todayText, type HomeworkDetail, type RosterRow } from './homework-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const teacher = make(['homework.read', 'homework.manage', 'academic.read']);
const principal = make(['homework.read', 'academic.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const roster: RosterRow[] = [
  { studentId: 'k1', admissionNo: 'A-1', name: 'Ali Khan', status: 'SUBMITTED', marks: 8, remark: null },
  { studentId: 'k2', admissionNo: 'A-2', name: 'Bilal Shah', status: null, marks: null, remark: null },
];
const item = {
  id: 'h1', title: 'Fractions worksheet', description: 'Do pages 10-12', assignedDate: '2026-11-02', dueDate: '2099-12-31', maxMarks: 10, state: 'UPCOMING' as const,
  class: { id: 'c5', name: 'Class 5' }, section: { id: 's1', name: 'A' }, subject: { id: 'sub1', name: 'Math' }, counts: { students: 2, submitted: 1, late: 0, missing: 0, pending: 1 },
};
const detail = (over: Partial<HomeworkDetail> = {}): HomeworkDetail => ({ ...item, roster, access: { canEdit: true, reason: null }, ...over });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser, hw: HomeworkDetail = detail()) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/homework/h1/submissions') && m === 'PUT') return json(200, hw);
    if (url.includes('/homework/h1') && m === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/homework/h1')) return json(200, hw);
    if (url.includes('/homework') && m === 'GET') return json(200, [item]);
    if (url.endsWith('/academics/classes')) return json(200, { classes: [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 2, sections: [{ id: 's1', classId: 'c5', name: 'A', capacity: null, studentCount: 2 }] }] });
    if (url.includes('/academics/classes/c5/subjects')) return json(200, { classId: 'c5', subjects: [{ id: 'sub1', name: 'Math', code: null }] });
    if (url.includes('/homework') && m === 'POST') return json(201, hw);
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/app/homework" element={<HomeworkListPage />} />
          <Route path="/app/homework/:id" element={<HomeworkDetailPage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));

describe('homework helpers', () => {
  it('parses marks text', () => {
    expect(parseMarks('')).toBeNull();
    expect(parseMarks(' 7 ')).toBe(7);
    expect(parseMarks('0')).toBe(0);
    expect(parseMarks('7.5')).toBeUndefined();
    expect(parseMarks('abc')).toBeUndefined();
    expect(parseMarks('12345')).toBeUndefined();
  });
  it('sends only the rows that changed, and drops marks of rows that did not hand in', () => {
    const d = draftOf(roster);
    expect(changedEntries(roster, d, 10)).toEqual([]);
    expect(changedEntries(roster, { ...d, k2: { status: 'LATE', marks: '6', remark: ' Next day ' } }, 10)).toEqual([{ studentId: 'k2', status: 'LATE', marks: 6, remark: 'Next day' }]);
    expect(changedEntries(roster, { ...d, k1: { status: 'MISSING', marks: '8', remark: '' } }, 10)).toEqual([{ studentId: 'k1', status: 'MISSING', marks: null, remark: null }]);
    expect(changedEntries(roster, { ...d, k1: { status: null, marks: '8', remark: 'x' } }, 10)).toEqual([{ studentId: 'k1', status: null, marks: null, remark: null }]);
  });
  it('rejects marks above the maximum, marks without a maximum and invalid marks text', () => {
    const d = draftOf(roster);
    expect(changedEntries(roster, { ...d, k1: { ...d.k1!, marks: '11' } }, 10)).toBeNull();
    expect(changedEntries(roster, { ...d, k1: { ...d.k1!, marks: '5' } }, null)).toBeNull();
    expect(changedEntries(roster, { ...d, k1: { ...d.k1!, marks: '5.5' } }, 10)).toBeNull();
  });
  it('picks tones and today', () => {
    expect(stateTone('OVERDUE')).toBe('neutral');
    expect(statusTone('MISSING')).toBe('danger');
    expect(statusTone('PENDING')).toBe('neutral');
    expect(todayText(new Date(Date.UTC(2026, 10, 4)))).toBe('2026-11-04');
  });
});

describe('homework pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });

  it('lists homework with its status and how many are checked', async () => {
    renderAt('/app/homework', teacher);
    const link = await screen.findByRole('link', { name: 'Fractions worksheet' });
    expect(link).toHaveAttribute('href', '/app/homework/h1');
    expect(screen.getByText('Class 5 – A')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add homework' })).toBeInTheDocument();
    expect(screen.getByLabelText('Only my homework')).toBeInTheDocument();
  });

  it('read-only users can list homework but not add', async () => {
    renderAt('/app/homework', principal);
    await screen.findByRole('link', { name: 'Fractions worksheet' });
    expect(screen.queryByRole('button', { name: 'Add homework' })).toBeNull();
    expect(screen.queryByLabelText('Only my homework')).toBeNull();
  });

  it('adds homework with the exact payload', async () => {
    renderAt('/app/homework', teacher);
    await userEvent.click(await screen.findByRole('button', { name: 'Add homework' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Title'), 'Chapter 4 questions');
    await userEvent.clear(dialog.getByLabelText('Due date'));
    await userEvent.type(dialog.getByLabelText('Due date'), '2099-12-31');
    await userEvent.type(dialog.getByLabelText('Maximum marks'), '20');
    await waitFor(() => expect((dialog.getByLabelText('Subject') as HTMLSelectElement).options.length).toBe(1));
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/homework')).toBeTruthy());
    expect(body('POST', '/homework')).toEqual({ sectionId: 's1', subjectId: 'sub1', title: 'Chapter 4 questions', description: null, dueDate: '2099-12-31', maxMarks: 20 });
  });

  it('records who handed in, saving only the changed rows', async () => {
    renderAt('/app/homework/h1', teacher);
    expect(await screen.findByText('Bilal Shah')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save checklist' });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Status Bilal Shah'), 'LATE');
    await userEvent.type(screen.getByLabelText('Marks Bilal Shah'), '6');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(sent('PUT', '/homework/h1/submissions')).toBeTruthy());
    expect(body('PUT', '/homework/h1/submissions')).toEqual({ entries: [{ studentId: 'k2', status: 'LATE', marks: 6, remark: null }] });
  });

  it('blocks saving marks above the maximum and says why', async () => {
    renderAt('/app/homework/h1', teacher);
    await screen.findByText('Ali Khan');
    const marks = screen.getByLabelText('Marks Ali Khan');
    await userEvent.clear(marks);
    await userEvent.type(marks, '11');
    expect(screen.getByRole('button', { name: 'Save checklist' })).toBeDisabled();
    expect(screen.getByText(/Check the marks/)).toBeInTheDocument();
  });

  it('marks every unchecked student as handed in', async () => {
    renderAt('/app/homework/h1', teacher);
    await screen.findByText('Bilal Shah');
    await userEvent.click(screen.getByRole('button', { name: 'Mark unchecked as handed in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save checklist' }));
    await waitFor(() => expect(sent('PUT', '/homework/h1/submissions')).toBeTruthy());
    expect(body('PUT', '/homework/h1/submissions')).toEqual({ entries: [{ studentId: 'k2', status: 'SUBMITTED', marks: null, remark: null }] });
  });

  it('shows another teacher\'s homework read-only', async () => {
    renderAt('/app/homework/h1', teacher, detail({ access: { canEdit: false, reason: 'NOT_YOUR_SUBJECT' } }));
    await screen.findByText('Bilal Shah');
    expect(screen.getByText(/only the teacher of this subject and section can change it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save checklist' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit homework' })).toBeNull();
    expect(screen.queryByLabelText('Status Bilal Shah')).toBeNull();
  });

  it('deletes after a confirmation', async () => {
    renderAt('/app/homework/h1', teacher);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent('DELETE', '/homework/h1')).toBeTruthy());
  });
});

describe('parent view of homework', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });
  it('shows status, due date, marks and the teacher remark per homework', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user: make(['portal.own.read', 'homework.read']) });
      if (url.includes('/portal/children/k1/homework')) {
        return json(200, [
          { id: 'h1', title: 'Fractions worksheet', description: null, subject: 'Math', assignedDate: '2026-11-02', dueDate: '2026-11-03', maxMarks: 20, state: 'OVERDUE', status: 'SUBMITTED', marks: 18, remark: 'Neat work' },
          { id: 'h2', title: 'Urdu essay', description: 'Write 10 lines', subject: 'Urdu', assignedDate: '2026-11-04', dueDate: '2099-12-31', maxMarks: null, state: 'UPCOMING', status: 'PENDING', marks: null, remark: null },
        ]);
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><AuthProvider><MemoryRouter><ChildHomeworkList studentId="k1" /></MemoryRouter></AuthProvider></ToastProvider></QueryClientProvider>);
    expect(await screen.findByText('Fractions worksheet')).toBeInTheDocument();
    expect(screen.getByText('Handed in')).toBeInTheDocument();
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
    expect(screen.getByText(/18 \/ 20 marks/)).toBeInTheDocument();
    expect(screen.getByText(/Neat work/)).toBeInTheDocument();
    expect(screen.getByText('Write 10 lines')).toBeInTheDocument();
  });
});
