import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import ExamDetailPage from '@/pages/exam-detail';
import ExamGradesPage from '@/pages/exam-grades';
import ExamMarksPage from '@/pages/exam-marks';
import ExamResultsPage from '@/pages/exam-results';
import ExamsListPage from '@/pages/exams-list';
import { markText, parseMark } from './exams-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const teacher = make(['exam.read', 'exam.marks.enter', 'academic.read']);
const manager = make(['exam.read', 'exam.manage', 'exam.marks.enter', 'exam.result.publish', 'academic.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const exam = { id: 'e1', sessionId: 's', sessionName: '2026-2027', name: 'Mid-Term', startDate: '2026-09-01', endDate: '2026-09-10', status: 'DRAFT', publishedAt: null, paperCount: 1 };
const paper = { id: 'p1', classId: 'c5', className: 'Class 5', subjectId: 'm', subjectName: 'Math', totalMarks: 100, passMarks: 33, examDate: null, entered: 1, students: 2 };
const sheet = {
  exam: { id: 'e1', name: 'Mid-Term', status: 'DRAFT' }, paper, access: { canEnter: true, reason: null },
  students: [
    { studentId: 'st1', admissionNo: '0001', name: 'Ali Khan', sectionName: 'A', marks: 90, absent: false, remark: null, entered: true },
    { studentId: 'st2', admissionNo: '0002', name: 'Sara Noor', sectionName: 'A', marks: null, absent: false, remark: null, entered: false },
  ],
};
const classes = [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 2, sections: [{ id: 'sA', classId: 'c5', name: 'A', capacity: 30, studentCount: 2 }] }];
const results = {
  exam, class: { id: 'c5', name: 'Class 5' }, subjects: [{ subjectId: 'm', subjectName: 'Math', totalMarks: 100, passMarks: 33 }],
  students: [
    { student: { id: 'st1', admissionNo: '0001', name: 'Ali Khan', sectionName: 'A' }, subjects: [{ subjectId: 'm', subjectName: 'Math', totalMarks: 100, passMarks: 33, entered: true, marks: 90, absent: false, percentage: 90, grade: 'A1', passed: true }], obtained: 90, total: 100, percentage: 90, grade: 'A1', passed: true, complete: true, position: 1 },
    { student: { id: 'st2', admissionNo: '0002', name: 'Sara Noor', sectionName: 'A' }, subjects: [{ subjectId: 'm', subjectName: 'Math', totalMarks: 100, passMarks: 33, entered: false, marks: null, absent: false, percentage: null, grade: null, passed: null }], obtained: 0, total: 100, percentage: null, grade: null, passed: null, complete: false, position: null },
  ],
  summary: { students: 2, complete: 1, incomplete: 1, passed: 1, failed: 0, passRate: 100 },
};
const bands = { bands: [{ grade: 'A', minPercent: 50, remark: null }, { grade: 'F', minPercent: 0, remark: null }], isDefault: false };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser, over: { sheet?: object; publish?: Response } = {}) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/academics/classes')) return json(200, { classes });
    if (url.includes('/exams/papers/p1/marks') && m === 'PUT') return json(200, over.sheet ?? sheet);
    if (url.includes('/exams/papers/p1/marks')) return json(200, over.sheet ?? sheet);
    if (url.endsWith('/exams/grade-bands') && m === 'PUT') return json(200, bands);
    if (url.endsWith('/exams/grade-bands')) return json(200, bands);
    if (url.includes('/exams/e1/results')) return json(200, results);
    if (url.endsWith('/exams/e1/publish') && m === 'POST') return over.publish ?? json(200, { ...exam, status: 'PUBLISHED', papers: [paper] });
    if (url.endsWith('/exams/e1')) return json(200, { ...exam, papers: [paper] });
    if (url.endsWith('/exams') && m === 'POST') return json(201, { ...exam, papers: [] });
    if (url.endsWith('/exams')) return json(200, [exam]);
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/app/exams" element={<ExamsListPage />} />
          <Route path="/app/exams/grades" element={<ExamGradesPage />} />
          <Route path="/app/exams/papers/:id" element={<ExamMarksPage />} />
          <Route path="/app/exams/:id" element={<ExamDetailPage />} />
          <Route path="/app/exams/:id/results" element={<ExamResultsPage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));

describe('mark parsing', () => {
  it('accepts numbers, A for absent and empty; rejects the rest', () => {
    expect(parseMark('45.5', 100)).toEqual({ entry: { marks: 45.5, absent: false }, error: null });
    expect(parseMark('a', 100)).toEqual({ entry: { marks: null, absent: true }, error: null });
    expect(parseMark('  ', 100)).toEqual({ entry: { marks: null, absent: false }, error: null });
    expect(parseMark('101', 100).error).toBe('tooHigh');
    expect(parseMark('12.345', 100).error).toBe('invalid');
    expect(parseMark('-5', 100).error).toBe('invalid');
    expect(parseMark('abc', 100).error).toBe('invalid');
    expect(markText({ marks: 90, absent: false })).toBe('90');
    expect(markText({ marks: null, absent: true })).toBe('A');
    expect(markText({ marks: null, absent: false })).toBe('');
  });
});

describe('exam pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lists exams and only managers get the Add exam button', async () => {
    renderAt('/app/exams', teacher);
    expect(await screen.findByText('Mid-Term')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add exam/ })).not.toBeInTheDocument();
  });

  it('lets a manager create an exam', async () => {
    const user = userEvent.setup();
    renderAt('/app/exams', manager);
    await user.click(await screen.findByRole('button', { name: /Add exam/ }));
    await user.type(screen.getByLabelText('Exam name'), 'Final Term');
    await user.click(screen.getByRole('button', { name: 'Create exam' }));
    await waitFor(() => expect(sent('POST', '/exams')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/exams')![1]!.body))).toEqual({ name: 'Final Term', startDate: null, endDate: null });
  });

  it('shows papers with progress and a link to enter marks', async () => {
    renderAt('/app/exams/e1', teacher);
    expect(await screen.findByText('Math')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 entered')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enter marks' })).toHaveAttribute('href', '/app/exams/papers/p1');
    expect(screen.queryByRole('button', { name: 'Publish results' })).not.toBeInTheDocument();
  });

  it('asks before publishing with marks missing, then publishes with force', async () => {
    const user = userEvent.setup();
    renderAt('/app/exams/e1', manager, { publish: json(409, { error: { code: 'MARKS_INCOMPLETE', message: 'missing', details: { missing: 1 } } }) });
    await user.click(await screen.findByRole('button', { name: 'Publish results' }));
    expect(await screen.findByText(/1 marks have not been entered/)).toBeInTheDocument();
    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Publish anyway' }));
    await waitFor(() => expect(sent('POST', '/exams/e1/publish')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/exams/e1/publish')![1]!.body))).toEqual({ force: true });
  });

  it('marks entry sends only changed rows, understands A, and blocks bad input', async () => {
    const user = userEvent.setup();
    renderAt('/app/exams/papers/p1', teacher);
    const sara = await screen.findByLabelText('Sara Noor: Marks');
    const save = screen.getByRole('button', { name: 'Save marks' });
    expect(save).toBeDisabled(); // nothing changed yet
    await user.type(sara, '150');
    expect(await screen.findByText('At most 100')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(sara);
    await user.type(sara, 'A');
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(sent('PUT', '/exams/papers/p1/marks')).toBeTruthy());
    expect(JSON.parse(String(sent('PUT', '/exams/papers/p1/marks')![1]!.body))).toEqual({ entries: [{ studentId: 'st2', marks: null, absent: true }] });
  });

  it('makes marks read-only and explains why when results are published or the subject is not yours', async () => {
    renderAt('/app/exams/papers/p1', teacher, { sheet: { ...sheet, exam: { ...sheet.exam, status: 'PUBLISHED' }, access: { canEnter: false, reason: 'PUBLISHED' } } });
    expect(await screen.findByText(/Results are published, so marks are locked/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ali Khan: Marks')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save marks' })).not.toBeInTheDocument();
  });

  it('shows class results with positions and an incomplete student without a result', async () => {
    renderAt('/app/exams/e1/results?classId=c5', teacher);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('Pass rate: 100%')).toBeInTheDocument();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('edits the grade scale only for managers, and refuses a scale without a 0% grade', async () => {
    const user = userEvent.setup();
    renderAt('/app/exams/grades', manager);
    const min = (await screen.findAllByLabelText('Minimum percentage'))[1];
    await user.clear(min);
    await user.type(min, '10');
    expect(await screen.findByText('One grade must start at 0%.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save grade scale' })).toBeDisabled();
    await user.clear(min);
    await user.type(min, '0');
    await user.click(screen.getByRole('button', { name: 'Save grade scale' }));
    await waitFor(() => expect(sent('PUT', '/exams/grade-bands')).toBeTruthy());
  });

  it('shows the grade scale read-only to teachers', async () => {
    renderAt('/app/exams/grades', teacher);
    expect((await screen.findAllByLabelText('Minimum percentage'))[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save grade scale' })).not.toBeInTheDocument();
  });
});
