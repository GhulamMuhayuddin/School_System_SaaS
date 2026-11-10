import i18n from '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import type { SessionUser } from '@/lib/api';
import { ReceiptPrintPage, VoucherPrintPage, VouchersBulkPrintPage } from '@/pages/fee-print';
import IdCardsPrintPage from '@/pages/id-cards-print';
import ReportCardsPrintPage from '@/pages/report-cards-print';
import StudentsListPage from '@/pages/students-list';

const user: SessionUser = {
  id: 'me', email: 'me@school.test', firstName: 'Pri', lastName: 'Ncipal', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions: ['exam.read', 'fee.read', 'student.read'],
};
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const school = { name: 'City School', address: 'Main Road', city: 'Lahore', phone: '042-1234567', email: null };
const exam = (status: 'PUBLISHED' | 'DRAFT') => ({
  id: 'e1', sessionId: 'ss', sessionName: '2026-27', name: 'Mid Term', startDate: null, endDate: null, status, publishedAt: status === 'PUBLISHED' ? '2026-11-01T00:00:00Z' : null, paperCount: 2,
  papers: [{ id: 'p1', classId: 'c5', className: 'Class 5', subjectId: 'math', subjectName: 'Maths', totalMarks: 100, passMarks: 40, examDate: null, entered: 2, students: 2 }],
});
const sub = (marks: number | null, absent = false) => ({ subjectId: 'math', subjectName: 'Maths', totalMarks: 100, passMarks: 40, entered: marks !== null || absent, marks, absent, percentage: marks, grade: marks === null ? null : 'A', passed: absent ? false : marks === null ? null : marks >= 40 });
const results = {
  exam: exam('PUBLISHED'), class: { id: 'c5', name: 'Class 5' }, subjects: [{ subjectId: 'math', subjectName: 'Maths', totalMarks: 100, passMarks: 40 }],
  students: [
    { student: { id: 'st1', admissionNo: 'A-1', name: 'Ali Khan', sectionName: 'A' }, subjects: [sub(85)], obtained: 85, total: 100, percentage: 85, grade: 'A', passed: true, complete: true, position: 1 },
    { student: { id: 'st2', admissionNo: 'A-2', name: 'Sara Noor', sectionName: 'A' }, subjects: [sub(null, true)], obtained: 0, total: 100, percentage: 0, grade: 'F', passed: false, complete: true, position: 2 },
  ],
  summary: { students: 2, complete: 2, incomplete: 0, passed: 1, failed: 1, passRate: 50 },
};
const payment = (voided: boolean) => ({ id: 'pay1', receiptNo: 'R-000001', voucherId: 'v1', voucherNo: 'V-000001', amount: 1500, method: 'CASH', reference: null, paidAt: '2026-11-03T08:00:00Z', voided, voidReason: voided ? 'Wrong amount' : null, student: { id: 'st1', admissionNo: 'A-1', name: 'Ali Khan' }, period: '2026-11' });
const voucher = (id: string, status = 'PARTIAL') => ({
  id, voucherNo: `V-${id}`, period: '2026-11', dueDate: '2026-11-10', status, overdue: false, student: { id: 'st1', admissionNo: 'A-1', name: 'Ali Khan' }, className: 'Class 5', sectionName: 'A',
  totalAmount: 5000, discountAmount: 500, netAmount: 4500, paidAmount: 1500, balance: 3000, items: [{ id: 'i1', description: 'Tuition fee', amount: 5000 }], payments: [payment(false)], cancelReason: null,
});
const studentRow = (id: string, first: string) => ({ id, admissionNo: `A-${id}`, firstName: first, lastName: 'Khan', gender: 'MALE', status: 'ACTIVE', class: { id: 'c5', name: 'Class 5' }, section: { id: 'sa', name: 'A' }, primaryGuardian: { name: 'Mr Khan', phone: '0300-1111111' } });

let examStatus: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED';
let paymentVoided = false;
function setup(path: string, route: string, ui: React.ReactNode) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url) => {
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/school/letterhead')) return json(200, { letterhead: school });
    if (url.includes('/exams/e1/results')) return json(200, { ...results, exam: exam(examStatus) });
    if (url.includes('/exams/e1')) return json(200, exam(examStatus));
    if (url.includes('/fees/payments/pay1')) return json(200, payment(paymentVoided));
    if (url.includes('/fees/vouchers/v1')) return json(200, voucher('v1'));
    if (url.includes('/fees/vouchers/v2')) return json(200, voucher('v2'));
    if (url.includes('/fees/vouchers?') || url.endsWith('/fees/vouchers')) return json(200, [voucher('v1'), voucher('v2'), voucher('v3', 'CANCELLED')].map(({ items: _i, payments: _p, cancelReason: _c, ...v }) => v));
    if (url.includes('/students/options')) return json(200, []);
    if (url.includes('/students?')) return json(200, { students: [studentRow('1', 'Ali'), studentRow('2', 'Sara'), studentRow('3', 'Omar')], total: 3 });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes><Route path={route} element={ui} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => { examStatus = 'PUBLISHED'; paymentVoided = false; await i18n.changeLanguage('en'); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('report cards', () => {
  it('prints one page per student with marks, result and position', async () => {
    const { container } = setup('/p/e1?classId=c5', '/p/:id', <ReportCardsPrintPage />);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(container.querySelectorAll('.print-page')).toHaveLength(2);
    expect(screen.getAllByText('City School').length).toBeGreaterThan(0);
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('Sara Noor')).toBeInTheDocument();
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(0);
  });
  it('can print a single student', async () => {
    const { container } = setup('/p/e1?classId=c5&studentId=st2', '/p/:id', <ReportCardsPrintPage />);
    expect(await screen.findByText('Sara Noor')).toBeInTheDocument();
    expect(container.querySelectorAll('.print-page')).toHaveLength(1);
    expect(screen.queryByText('Ali Khan')).not.toBeInTheDocument();
  });
  it('refuses to print before the results are published', async () => {
    examStatus = 'DRAFT';
    const { container } = setup('/p/e1?classId=c5', '/p/:id', <ReportCardsPrintPage />);
    expect(await screen.findByText(/only be printed after the exam results are published/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.print-page')).toHaveLength(0);
  });
  it('switches the sheet to Urdu right-to-left', async () => {
    const { container } = setup('/p/e1?classId=c5', '/p/:id', <ReportCardsPrintPage />);
    await screen.findByText('Ali Khan');
    await userEvent.click(screen.getByRole('button', { name: 'اردو' }));
    expect(await screen.findAllByText('رپورٹ کارڈ', { selector: 'h2' })).toHaveLength(2);
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  });
});

describe('fee vouchers and receipts', () => {
  it('prints a voucher twice (school and parent copy) with the balance due', async () => {
    setup('/p/v1', '/p/:id', <VoucherPrintPage />);
    expect(await screen.findByText('School copy')).toBeInTheDocument();
    expect(screen.getByText('Parent copy')).toBeInTheDocument();
    expect(screen.getAllByText('Balance due')).toHaveLength(2);
    expect(screen.getAllByText('Rs 3,000')).toHaveLength(2);
  });
  it('bulk print skips cancelled vouchers', async () => {
    const { container } = setup('/p?status=', '/p', <VouchersBulkPrintPage />);
    await waitFor(() => expect(container.querySelectorAll('.print-page')).toHaveLength(2));
    expect(screen.getAllByText('School copy')).toHaveLength(2);
  });
  it('prints a receipt, and marks a voided one', async () => {
    const first = setup('/p/pay1', '/p/:id', <ReceiptPrintPage />);
    expect(await screen.findByText('R-000001')).toBeInTheDocument();
    expect(screen.getByText('Rs 1,500')).toBeInTheDocument();
    expect(screen.queryByText(/CANCELLED RECEIPT/)).not.toBeInTheDocument();
    first.unmount();
    paymentVoided = true;
    setup('/p/pay1', '/p/:id', <ReceiptPrintPage />);
    expect(await screen.findByText(/CANCELLED RECEIPT — Wrong amount/)).toBeInTheDocument();
  });
});

describe('ID cards', () => {
  it('prints a card for each active student', async () => {
    setup('/p?classId=c5', '/p', <IdCardsPrintPage />);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText('Sara Khan')).toBeInTheDocument();
    expect(screen.getByText('Omar Khan')).toBeInTheDocument();
    expect(screen.getAllByText('Student ID card')).toHaveLength(3);
    const asked = String(fetchMock.mock.calls.find((c) => String(c[0]).includes('/students?'))![0]);
    expect(asked).toContain('status=ACTIVE');
  });
});

describe('CSV export from the students list', () => {
  it('downloads the rows on screen as a CSV file', async () => {
    const blobs: Blob[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    setup('/p', '/p', <StudentsListPage />);
    await screen.findByText('Sara Khan');
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(blobs[0]!); });
    expect(text.replace('﻿', '')).toContain('Admission No,First name,Last name');
    expect(text).toContain('Omar,Khan,MALE,Class 5,A,ACTIVE,Mr Khan,0300-1111111');
    expect(within(document.body).getByRole('link', { name: 'Print ID cards' })).toBeInTheDocument();
  });
});
