import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PortalChildPage from '@/pages/portal-child';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import AdmissionDetailPage from '@/pages/admission-detail';
import AdmissionsListPage from '@/pages/admissions-list';
import HomePage from '@/pages/home';

const CLASS = '33333333-3333-4333-8333-333333333333';
const SEC = '44444444-4444-4444-8444-444444444444';
const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const admin = make(['admission.read', 'admission.create', 'admission.update', 'admission.approve', 'student.read', 'academic.read']);
const reader = make(['admission.read']);
const parent = make(['portal.own.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const row = { id: 'a1', applicationNo: 'APP-0001', status: 'PENDING', firstName: 'Sara', lastName: 'Noor', gender: 'FEMALE', appliedClass: { id: CLASS, name: 'Class 1' }, guardianName: 'Noor Ahmed', guardianPhone: '0300-1112223', applicationDate: '2026-10-01' };
const detail = { ...row, dateOfBirth: '2016-02-03', bloodGroup: null, previousSchool: null, address: null, notes: null, guardianEmail: null, guardianRelation: 'FATHER', guardianOccupation: null, decidedAt: null, decidedBy: null, decisionNote: null, student: null, createdAt: '2026-10-01T00:00:00Z' };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/students/options')) return json(200, { options: { classes: [{ id: CLASS, name: 'Class 1', level: 1, sections: [{ id: SEC, name: 'A', capacity: 30 }] }] } });
    if (url.endsWith('/admissions/a1/approve') && m === 'POST') return json(200, { application: { ...detail, status: 'APPROVED' }, student: { id: 's9', admissionNo: '0001' } });
    if (url.endsWith('/admissions/a1') && m === 'GET') return json(200, { application: detail });
    if (url.includes('/admissions?')) return json(200, { applications: [row], total: 1 });
    if (url.endsWith('/portal/children')) return json(200, { viewer: 'PARENT', guardianName: 'Noor Ahmed', children: [{ id: 's9', admissionNo: '0001', firstName: 'Ali', lastName: 'Khan', status: 'ACTIVE', class: { id: CLASS, name: 'Class 1' }, section: { id: SEC, name: 'A' } }] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}>
        <Suspense fallback={null}><Routes>
          <Route path="/app" element={<HomePage />} />
          <Route path="/app/portal/:studentId/:tab?" element={<PortalChildPage />} />
          <Route path="/app/admissions" element={<AdmissionsListPage />} />
          <Route path="/app/admissions/:id" element={<AdmissionDetailPage />} />
        </Routes></Suspense>
      </MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}

describe('admissions and parent portal pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('lists applications and offers "New application" only to users who may create', async () => {
    const view = renderAt('/app/admissions', admin);
    expect(await screen.findByText('Sara Noor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New application' })).toBeInTheDocument();
    view.unmount();
    renderAt('/app/admissions', reader);
    expect(await screen.findByText('Sara Noor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New application' })).not.toBeInTheDocument();
  });

  it('approves a pending application with the chosen class and date', async () => {
    const user = userEvent.setup();
    renderAt('/app/admissions/a1', admin);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Approve')!);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/admissions/a1/approve'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ classId: CLASS });
    });
  });

  it('hides approve/reject from users without admission.approve', async () => {
    renderAt('/app/admissions/a1', reader);
    expect(await screen.findByText('APP-0001', { selector: 'span,li,h1,dd,p' }).catch(() => screen.findAllByText('APP-0001'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows a parent only their own children on the home page', async () => {
    renderAt('/app', parent);
    // a parent with one child lands directly on that child's portal page
    expect(await screen.findByRole('heading', { name: 'Ali Khan' })).toBeInTheDocument();
    expect(screen.getByText(/Class 1/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => /\/students(\/|\?|$)/.test(String(c[0])))).toBe(false);
  });
});
