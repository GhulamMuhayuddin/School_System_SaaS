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
import CertificatePrintPage from '@/pages/certificate-print';
import CertificatesPage from '@/pages/certificates';
import PayslipPrintPage from '@/pages/payslip-print';
import { certTone, certificateText, type Certificate } from './certificates-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Pri', lastName: 'Ncipal', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const clerk = make(['certificate.read', 'certificate.issue']);
const viewer = make(['certificate.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const cert: Certificate = {
  id: 'k1', certNo: 'CERT-000001', type: 'BONAFIDE', studentId: 'st1', studentName: 'Ali Khan', gender: 'MALE', fatherName: 'Mr Raza', admissionNo: 'A-1', className: 'Class 5', sectionName: 'A',
  dateOfBirth: '2015-03-02', admissionDate: '2022-04-01', leftAt: null, issuedOn: '2026-11-04', purpose: 'Passport application', remarks: null, status: 'VALID', voidReason: null, issuedBy: 'Pri Ncipal', createdAt: '2026-11-04T09:00:00Z',
};
const school = { name: 'City School', address: 'Main Road', city: 'Lahore', phone: '042-1234567', email: null };
const slip = {
  id: 's1', slipNo: 'P-000001', runId: 'run1', period: '2026-10', staff: { id: 'st1', employeeNo: 'E-1', name: 'Ahmed S', designation: 'Teacher' }, basic: 25000, allowances: 5000, fixedDeduction: 1500,
  absentDays: 3, unpaidLeaveDays: 1, outsideDays: 0, deductionDays: 4, attendanceDeduction: 4000, bonus: 2000, otherDeduction: 500, note: null, gross: 30000, net: 26000, paid: true, paidOn: '2026-11-04', method: 'CASH', accountEntryNo: 'EXP-000001', paymentVoided: false,
};

function setup(user: SessionUser, path: string, route: string, ui: React.ReactNode) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/certificates/k1/void')) return json(200, { certificate: { ...cert, status: 'VOID', voidReason: 'Wrong name' }, school });
    if (url.includes('/certificates/k1')) return json(200, { certificate: cert, school });
    if (url.includes('/certificates') && m === 'POST') return json(201, { certificate: cert, school });
    if (url.includes('/certificates')) return json(200, { certificates: [cert], truncated: false });
    if (url.includes('/students?')) return json(200, { students: [{ id: 'st1', admissionNo: 'A-1', firstName: 'Ali', lastName: 'Khan', gender: 'MALE', status: 'ACTIVE', class: { id: 'c5', name: 'Class 5' }, section: null, primaryGuardian: null }], total: 1 });
    if (url.includes('/payroll/payslips/s1') || url.includes('/payroll/my/s1')) return json(200, { payslip: slip, school });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes><Route path={route} element={ui} /><Route path="/app/certificates/:id/print" element={<CertificatePrintPage />} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));

describe('certificate wording', () => {
  const fmt = (iso: string) => iso;
  const en = i18n.getFixedT('en') as unknown as (k: string, o?: Record<string, unknown>) => string;
  const ur = i18n.getFixedT('ur') as unknown as (k: string, o?: Record<string, unknown>) => string;
  it('writes a bonafide certificate in English, with son / daughter and his / her', () => {
    expect(certificateText(en, cert, fmt)).toEqual([
      'This is to certify that Ali Khan, son of Mr Raza, is a bonafide student of this school, currently studying in Class 5 (A) (Admission No. A-1). His date of birth according to the school record is 2015-03-02.',
      'This certificate is issued on request, for: Passport application.',
    ]);
    const girl = certificateText(en, { ...cert, gender: 'FEMALE', fatherName: null, purpose: null }, fmt);
    expect(girl[0]).toContain('Her date of birth');
    expect(girl[0]).not.toContain(' of Mr Raza');
    expect(girl[1]).toBe('This certificate is issued on request.');
  });
  it('character: still studying or left; uses the given remark or a default', () => {
    expect(certificateText(en, { ...cert, type: 'CHARACTER' }, fmt)[0]).toContain('is currently studying in Class 5 (A)');
    const left = certificateText(en, { ...cert, type: 'CHARACTER', leftAt: '2026-10-15', remarks: 'Always polite' }, fmt);
    expect(left[0]).toContain('from 2022-04-01 to 2026-10-15');
    expect(left[1]).toBe('Always polite');
    expect(certificateText(en, { ...cert, type: 'CHARACTER' }, fmt)[1]).toBe('During this period his conduct and character were found satisfactory.');
  });
  it('leaving: dates, birth date, reason and remarks, with no empty paragraphs', () => {
    const p = certificateText(en, { ...cert, type: 'LEAVING', leftAt: '2026-10-15', purpose: 'Family moved', remarks: null }, fmt);
    expect(p).toHaveLength(3);
    expect(p[2]).toBe('Reason for leaving: Family moved.');
    expect(certificateText(en, { ...cert, type: 'LEAVING', leftAt: '2026-10-15', purpose: null }, fmt)).toHaveLength(2);
  });
  it('writes Urdu without leftover placeholders', () => {
    for (const type of ['BONAFIDE', 'CHARACTER', 'LEAVING'] as const) {
      for (const p of certificateText(ur, { ...cert, type, leftAt: type === 'BONAFIDE' ? null : '2026-10-15', gender: 'FEMALE' }, fmt)) { expect(p).not.toMatch(/\{\{|undefined|null/); expect(p.length).toBeGreaterThan(10); }
    }
    expect(certificateText(ur, cert, fmt)[0]).toContain('Ali Khan، ولد Mr Raza،');
  });
  it('colours the status', () => { expect(certTone('VALID')).toBe('success'); expect(certTone('VOID')).toBe('danger'); });
});

describe('certificates register', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lists the register with print and cancel actions', async () => {
    setup(clerk, '/app/certificates', '/app/certificates', <CertificatesPage />);
    expect(await screen.findByText('CERT-000001')).toBeInTheDocument();
    expect(screen.getByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/app/certificates/k1/print');
    expect(screen.getByRole('button', { name: 'Cancel certificate' })).toBeInTheDocument();
  });

  it('issues a certificate and goes to its print page', async () => {
    setup(clerk, '/app/certificates', '/app/certificates', <CertificatesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Issue a certificate' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Find the student'), 'ali');
    await userEvent.selectOptions(await within(dialog).findByLabelText('Student'), 'st1');
    await userEvent.type(within(dialog).getByLabelText('Needed for (optional)'), 'Passport application');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Issue' }));
    await waitFor(() => expect(sent('POST', '/certificates')).toBeTruthy());
    expect(body('POST', '/certificates')).toMatchObject({ studentId: 'st1', type: 'BONAFIDE', purpose: 'Passport application', remarks: null });
    expect(await screen.findByRole('heading', { name: 'Bonafide Certificate' })).toBeInTheDocument(); // the print page opened
  });

  it('cancelling needs a reason', async () => {
    setup(clerk, '/app/certificates', '/app/certificates', <CertificatesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel certificate' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel certificate' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Wrong name');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel certificate' }));
    await waitFor(() => expect(sent('POST', '/certificates/k1/void')).toBeTruthy());
    expect(body('POST', '/certificates/k1/void')).toEqual({ reason: 'Wrong name' });
  });

  it('a viewer can print but not issue or cancel', async () => {
    setup(viewer, '/app/certificates', '/app/certificates', <CertificatesPage />);
    expect(await screen.findByText('CERT-000001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue a certificate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel certificate' })).not.toBeInTheDocument();
  });
});

describe('print pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows the certificate on a sheet with the school header, and prints on request', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    setup(clerk, '/app/certificates/k1/print', '/app/certificates/:id/print', <CertificatePrintPage />);
    expect(await screen.findByRole('heading', { name: 'City School' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bonafide Certificate' })).toBeInTheDocument();
    expect(screen.getByText(/is a bonafide student of this school/)).toBeInTheDocument();
    expect(screen.getByText('CERT-000001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('switches the sheet to Urdu, right to left', async () => {
    setup(clerk, '/app/certificates/k1/print', '/app/certificates/:id/print', <CertificatePrintPage />);
    expect(await screen.findByRole('heading', { name: 'Bonafide Certificate' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'اردو' }));
    expect(await screen.findByRole('heading', { name: 'بونافائیڈ سرٹیفکیٹ' })).toBeInTheDocument();
    expect(document.querySelector('.print-area')).toHaveAttribute('dir', 'rtl');
    expect(document.querySelector('.print-area')).toHaveAttribute('lang', 'ur');
  });

  it('marks a cancelled certificate', async () => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user: viewer });
      return json(200, { certificate: { ...cert, status: 'VOID', voidReason: 'Wrong name' }, school });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/certificates/k1/print']}><Routes><Route path="/app/certificates/:id/print" element={<CertificatePrintPage />} /></Routes></MemoryRouter></AuthProvider></ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('This certificate has been cancelled and is not valid.')).toBeInTheDocument();
  });

  it('prints a salary slip with the totals', async () => {
    setup(clerk, '/app/payslips/s1/print', '/app/payslips/:id/print', <PayslipPrintPage />);
    expect(await screen.findByText(/Salary slip — October 2026/)).toBeInTheDocument();
    expect(screen.getByText('Ahmed S')).toBeInTheDocument();
    expect(screen.getByText('P-000001')).toBeInTheDocument();
    expect(screen.getByText('Attendance deduction (4 unpaid days)')).toBeInTheDocument();
    expect(screen.getByText('Rs 26,000')).toBeInTheDocument(); // net pay
    expect(screen.getByText('Rs 6,000')).toBeInTheDocument();  // total deductions: 1,500 + 4,000 + 500
    expect(screen.getByText('Rs 32,000')).toBeInTheDocument(); // gross 30,000 + bonus 2,000
    expect(sent('GET', '/payroll/payslips/s1')).toBeTruthy();
  });

  it('a staff member prints their own slip through the own-slip endpoint', async () => {
    setup(make([]), '/app/payslips/s1/print?own=1', '/app/payslips/:id/print', <PayslipPrintPage />);
    expect(await screen.findByText('Ahmed S')).toBeInTheDocument();
    expect(sent('GET', '/payroll/my/s1')).toBeTruthy();
    expect(sent('GET', '/payroll/payslips/s1')).toBeUndefined();
  });
});
