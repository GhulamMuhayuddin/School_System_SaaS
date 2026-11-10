import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { setAccessToken, setSessionLostHandler, type SessionUser } from '@/lib/api';
import LoginPage from '@/pages/login';
import ForgotPasswordPage from '@/pages/forgot-password';
import ResetPasswordPage from '@/pages/reset-password';
import { AuthProvider, useAuth } from './auth-context';
import { PublicOnly, RequireAuth, RequirePermission } from './guards';

const teacher: SessionUser = {
  id: 'u1', email: 'teacher@school.test', firstName: 'Ayesha', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r1', key: 'teacher', name: 'Teacher' }, school: { id: 's1', name: 'Demo School', code: 'demo' },
  permissions: ['attendance.mark', 'student.read'],
};

const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, message = code, details?: unknown) => reply(status, { error: { code, message, details } });

function Dashboard() {
  const { user, can, logout } = useAuth();
  return (
    <div>
      <p>Dashboard of {user?.firstName}</p>
      <p>{can('attendance.mark') ? 'can mark attendance' : 'cannot mark attendance'}</p>
      <p>{can('fee.collect') ? 'can collect fees' : 'cannot collect fees'}</p>
      <RequirePermission permission="fee.collect"><p>fee screen</p></RequirePermission>
      <button onClick={() => void logout()}>sign out</button>
    </div>
  );
}

function renderApp(path: string) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              </Route>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/app" element={<Dashboard />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('authentication flow', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  let hasSession = false;
  let loginResult: () => Response;
  const calls = (url: string) => fetchMock.mock.calls.filter((c) => c[0] === url);

  beforeEach(() => {
    hasSession = false;
    loginResult = () => reply(200, { accessToken: 't1', expiresIn: 900, user: teacher });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url) => {
      if (url === '/api/auth/refresh') return hasSession ? reply(200, { accessToken: 't0', expiresIn: 900, user: teacher }) : apiError(401, 'SESSION_EXPIRED');
      if (url === '/api/auth/login') return loginResult();
      if (url === '/api/auth/logout') return reply(204);
      if (url === '/api/auth/forgot-password') return reply(200, { message: 'sent' });
      if (url === '/api/auth/reset-password') return reply(204);
      return apiError(404, 'NOT_FOUND');
    });
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken(null);
    setSessionLostHandler(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends a signed-out visitor from /app to the login page', async () => {
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument();
    expect(screen.queryByText(/Dashboard of/)).not.toBeInTheDocument();
  });

  it('signs in with the typed credentials and lands on the dashboard', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'teacher@school.test');
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-9');
    await user.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Dashboard of Ayesha')).toBeInTheDocument();
    expect(JSON.parse(calls('/api/auth/login')[0]![1]!.body as string)).toEqual({ email: 'teacher@school.test', password: 'Correct-Horse-9', remember: true });
  });

  it('shows the server error for wrong credentials and stays on the login page', async () => {
    loginResult = () => apiError(401, 'INVALID_CREDENTIALS');
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'teacher@school.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.queryByText(/Dashboard of/)).not.toBeInTheDocument();
  });

  it('tells the user how long a locked account must wait', async () => {
    loginResult = () => apiError(423, 'ACCOUNT_LOCKED', 'locked', { retryAfterSeconds: 600 });
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'teacher@school.test');
    await user.type(screen.getByLabelText('Password'), 'whatever-123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 10 minute(s).');
  });

  it('does not call the API when the form is invalid', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(calls('/api/auth/login')).toHaveLength(0);
  });

  it('restores an existing session on page load and skips the login page', async () => {
    hasSession = true;
    renderApp('/login');
    expect(await screen.findByText('Dashboard of Ayesha')).toBeInTheDocument();
  });

  it('hides actions the role may not do, and blocks a page that needs a missing permission', async () => {
    hasSession = true;
    renderApp('/app');
    expect(await screen.findByText('can mark attendance')).toBeInTheDocument();
    expect(screen.getByText('cannot collect fees')).toBeInTheDocument();
    expect(screen.getByText('You do not have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('fee screen')).not.toBeInTheDocument();
  });

  it('signs out: calls the API and returns to the login page', async () => {
    hasSession = true;
    const user = userEvent.setup();
    renderApp('/app');
    await user.click(await screen.findByRole('button', { name: 'sign out' }));
    await waitFor(() => expect(calls('/api/auth/logout')).toHaveLength(1));
    // the guard now sends the anonymous user back to /login
    expect(await screen.findByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument();
  });

  it('forgot password shows the same confirmation for any email', async () => {
    const user = userEvent.setup();
    renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'someone@school.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(JSON.parse(calls('/api/auth/forgot-password')[0]![1]!.body as string)).toEqual({ email: 'someone@school.test' });
  });

  it('reset password: a link without a token explains the problem', async () => {
    renderApp('/reset-password');
    expect(await screen.findByText('Reset link is incomplete')).toBeInTheDocument();
  });

  it('reset password: sends the token from the link with the new password', async () => {
    const user = userEvent.setup();
    renderApp('/reset-password?token=abc123abc123abc123abc123');
    await user.type(await screen.findByLabelText('New password'), 'Brand-New-Pass-1');
    await user.type(screen.getByLabelText('Confirm password'), 'Brand-New-Pass-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(JSON.parse(calls('/api/auth/reset-password')[0]![1]!.body as string)).toEqual({ token: 'abc123abc123abc123abc123', password: 'Brand-New-Pass-1' });
  });

  it('reset password: shows the API message for an expired link', async () => {
    fetchMock.mockImplementation(async (url) => (url === '/api/auth/reset-password' ? apiError(400, 'INVALID_RESET_TOKEN') : apiError(401, 'SESSION_EXPIRED')));
    const user = userEvent.setup();
    renderApp('/reset-password?token=abc123abc123abc123abc123');
    await user.type(await screen.findByLabelText('New password'), 'Brand-New-Pass-1');
    await user.type(screen.getByLabelText('Confirm password'), 'Brand-New-Pass-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });
});
