import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import type { SessionUser } from '@/lib/api';
import LibraryPage from '@/pages/library';
import { loanTone, parseSettings } from './library-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Lara', lastName: 'Rian', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const librarian = make(['library.read', 'library.issue', 'library.manage', 'student.read']);
const viewer = make(['library.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const book = { id: 'b1', title: 'Gulistan', author: 'Saadi', isbn: null, category: 'Poetry', publisher: null, language: null, location: 'Shelf 2', active: true, counts: { total: 2, available: 1, issued: 1, lost: 0, withdrawn: 0 } };
const detail = { ...book, copies: [
  { id: 'c1', accessionNo: 'LIB-000001', status: 'AVAILABLE', loan: null },
  { id: 'c2', accessionNo: 'LIB-000002', status: 'ISSUED', loan: { id: 'l1', student: { id: 's1', name: 'Ali Khan', admissionNo: 'A-1' }, dueOn: '2026-11-01', overdue: true } },
] };
const loan = { id: 'l1', copy: { id: 'c2', accessionNo: 'LIB-000002' }, book: { id: 'b1', title: 'Gulistan', author: 'Saadi' }, student: { id: 's1', name: 'Ali Khan', admissionNo: 'A-1', className: 'Class 5' }, issuedOn: '2026-10-18', dueOn: '2026-11-01', returnedOn: null, renewals: 0, state: 'OVERDUE', overdueDays: 5, fine: 25, fineStatus: 'NONE' };
const summary = { books: 1, copies: 2, available: 1, issued: 1, overdue: 1, unpaidFines: { count: 0, amount: 0 } };

function renderPage(user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/library/summary')) return json(200, summary);
    if (url.includes('/library/books/b1')) return json(200, detail);
    if (url.includes('/library/books') && m === 'POST') return json(201, detail);
    if (url.includes('/library/books')) return json(200, { books: [book], categories: ['Poetry'], truncated: false });
    if (url.includes('/library/loans/l1/return')) return json(200, { ...loan, state: 'RETURNED', returnedOn: '2026-11-06', fineStatus: 'UNPAID' });
    if (url.includes('/library/loans') && m === 'POST') return json(201, { ...loan, state: 'OPEN', dueOn: '2026-11-20', fine: 0 });
    if (url.includes('/library/loans')) return json(200, { loans: [loan], truncated: false });
    if (url.includes('/library/settings')) return json(200, { loanDays: 14, finePerDay: 5, maxBooksStudent: 3 });
    if (url.includes('/students')) return json(200, { students: [{ id: 's9', admissionNo: 'A-9', firstName: 'Sara', lastName: 'Shah', status: 'ACTIVE' }], total: 1 });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/library']}><Suspense fallback={null}>
        <Routes><Route path="/app/library" element={<LibraryPage />} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('library helpers', () => {
  it('validates the rules fields against the server limits', () => {
    expect(parseSettings({ loanDays: '14', finePerDay: '5', maxBooksStudent: '3' })).toEqual({ loanDays: 14, finePerDay: 5, maxBooksStudent: 3 });
    expect(parseSettings({ loanDays: '0', finePerDay: '5', maxBooksStudent: '3' })).toBeNull();
    expect(parseSettings({ loanDays: '91', finePerDay: '5', maxBooksStudent: '3' })).toBeNull();
    expect(parseSettings({ loanDays: '14', finePerDay: '-1', maxBooksStudent: '3' })).toBeNull();
    expect(parseSettings({ loanDays: '14', finePerDay: '5', maxBooksStudent: '21' })).toBeNull();
    expect(parseSettings({ loanDays: '1.5', finePerDay: '5', maxBooksStudent: '3' })).toBeNull();
  });
  it('colours loan states', () => {
    expect(loanTone('OVERDUE')).toBe('danger');
    expect(loanTone('RETURNED')).toBe('success');
    expect(loanTone('OPEN')).toBe('warning');
  });
});

describe('library page', () => {
  it('shows the summary and the catalogue, and a copy list with the borrower', async () => {
    renderPage(librarian);
    expect(await screen.findByText('Gulistan')).toBeInTheDocument();
    expect(await screen.findByText('Unpaid fines')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Gulistan/ }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText('LIB-000002')).toBeInTheDocument();
    expect(within(dlg).getByText(/Ali Khan \(A-1\)/)).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Mark lost' })).toBeInTheDocument();
  });
  it('read-only staff cannot add books or issue', async () => {
    renderPage(viewer);
    expect(await screen.findByText('Gulistan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add book' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Issue desk' }));
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue book' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return' })).not.toBeInTheDocument();
  });
  it('adds a book with the exact payload', async () => {
    renderPage(librarian);
    await userEvent.click(await screen.findByRole('button', { name: 'Add book' }));
    await userEvent.type(screen.getByLabelText('Title'), '  Bustan ');
    await userEvent.type(screen.getByLabelText('Author'), 'Saadi');
    const copies = screen.getByLabelText('Copies');
    await userEvent.clear(copies); await userEvent.type(copies, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/library/books')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/library/books')![1]!.body))).toMatchObject({ title: 'Bustan', author: 'Saadi', copies: 3, isbn: null });
  });
  it('returns an overdue book from the issue desk', async () => {
    renderPage(librarian);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue desk' }));
    expect(await screen.findByText('Overdue 5 day(s)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(sent('POST', '/library/loans/l1/return')).toBeTruthy());
  });
  it('issues by accession number and the chosen student', async () => {
    renderPage(librarian);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue desk' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Issue book' }));
    await userEvent.type(screen.getByLabelText('Accession number'), 'lib-000001');
    await userEvent.type(screen.getByLabelText('Find student'), 'Sa');
    await userEvent.selectOptions(await screen.findByLabelText('Student'), 's9');
    await userEvent.click(screen.getByRole('button', { name: 'Issue' }));
    await waitFor(() => expect(sent('POST', '/library/loans')).toBeTruthy());
    expect(JSON.parse(String(sent('POST', '/library/loans')![1]!.body))).toEqual({ accessionNo: 'lib-000001', studentId: 's9' });
  });
});
