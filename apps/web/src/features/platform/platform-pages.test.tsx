import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { setAccessToken, type SessionUser } from '@/lib/api';
import HomePage from '@/pages/home';
import PlatformSchoolsPage from '@/pages/platform-schools';

const PLAN = '33333333-3333-4333-8333-333333333333';
const superAdmin: SessionUser = {
  id: 'sa', email: 'root@nexora.test', firstName: 'Platform', lastName: 'Admin', preferredLang: 'en',
  role: { id: 'r', key: 'super_admin', name: 'Super Administrator' }, school: null,
  permissions: ['platform.school.manage', 'platform.plan.manage', 'platform.analytics.view', 'platform.logs.view', 'platform.admin.manage'],
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const school = { id: 's1', name: 'City School', code: 'city', status: 'ACTIVE', email: null, city: 'Lahore', createdAt: '2026-10-01T00:00:00Z', userCount: 3, subscription: { id: 'x', planId: PLAN, planName: 'Starter', status: 'TRIAL', startsAt: '2026-10-01T00:00:00Z', endsAt: null } };
const analytics = {
  schools: { total: 1, active: 1, suspended: 0 }, users: { schoolUsers: 3, platformAdmins: 1 },
  subscriptions: { TRIAL: 1, ACTIVE: 0, PAST_DUE: 0, CANCELLED: 0, EXPIRED: 0, NONE: 0 },
  newSchoolsByMonth: [{ month: '2026-10', count: 1 }], logins7d: 12, failedLogins7d: 2,
};

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/app" element={<HomePage />} />
              <Route path="/app/platform/schools" element={<PlatformSchoolsPage />} />
              <Route path="/app/platform/schools/:id" element={<p>detail page</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Super Admin pages', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  let schools: unknown[];
  beforeEach(() => {
    schools = [school];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user: superAdmin });
      if (url.endsWith('/platform/analytics')) return json(200, { analytics });
      if (url.endsWith('/platform/plans')) return json(200, { plans: [{ id: PLAN, name: 'Starter', priceMonthly: 0, maxStudents: null, maxStaff: null, isActive: true, schoolCount: 1 }] });
      if (url.endsWith('/platform/schools') && method === 'POST') { schools.push({ ...school, id: 's2', name: 'New School' }); return json(201, { school: { ...school, id: 's2', name: 'New School' } }); }
      if (url.endsWith('/platform/schools')) return json(200, { schools });
      return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('shows real analytics (not sample data) on the platform home page', async () => {
    renderAt('/app');
    expect(await screen.findByText('Platform overview across all schools')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // sign-ins in 7 days
    expect(screen.getByText(/2 failed sign-in attempts/)).toBeInTheDocument();
  });

  it('lists schools and validates then submits the create form', async () => {
    const user = userEvent.setup();
    renderAt('/app/platform/schools');
    expect(await screen.findByText('City School')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add school' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create school' }));
    expect((await within(dialog).findAllByText('This field is required')).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/platform/schools'))).toBe(false);

    await user.type(within(dialog).getByLabelText('School name'), 'New School');
    await user.type(within(dialog).getByLabelText('School code'), 'new-school');
    await user.selectOptions(within(dialog).getByLabelText('Plan'), PLAN);
    await user.type(within(dialog).getByLabelText('First name'), 'Sara');
    await user.type(within(dialog).getByLabelText('Last name'), 'Ali');
    await user.type(within(dialog).getByLabelText('Email', { selector: '#cs-ae' }), 'sara@new.test');
    await user.type(within(dialog).getByLabelText('Initial password'), 'long-enough-pw');
    await user.click(within(dialog).getByRole('button', { name: 'Create school' }));

    await waitFor(() => expect(screen.getByText('detail page')).toBeInTheDocument());
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/platform/schools'))!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ code: 'new-school', planId: PLAN, admin: { email: 'sara@new.test' } });
  });
});
