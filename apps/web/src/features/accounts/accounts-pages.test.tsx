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
import AccountsCategoriesPage from '@/pages/accounts-categories';
import AccountsLedgerPage from '@/pages/accounts-ledger';
import AccountsReportsPage from '@/pages/accounts-reports';
import { balanceOf, kindTone, monthStartText, todayText } from './accounts-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Meher', lastName: 'Khan', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const accountant = make(['accounts.read', 'accounts.manage']);
const viewer = make(['accounts.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const categories = [
  { id: 'c1', kind: 'EXPENSE', name: 'Utilities', isActive: true }, { id: 'c2', kind: 'EXPENSE', name: 'Rent', isActive: true },
  { id: 'c3', kind: 'INCOME', name: 'Donations', isActive: true }, { id: 'c4', kind: 'INCOME', name: 'Old income', isActive: false },
];
const entry = (over: object) => ({ method: 'CASH', party: null, reference: null, voided: false, voidReason: null, createdAt: '2026-11-03T10:00:00Z', ...over });
const entries = [
  entry({ id: 'e1', entryNo: 'EXP-000001', kind: 'EXPENSE', category: { id: 'c1', name: 'Utilities' }, amount: 3000, entryDate: '2026-11-03', description: 'Electricity bill' }),
  entry({ id: 'e2', entryNo: 'INC-000001', kind: 'INCOME', category: { id: 'c3', name: 'Donations' }, amount: 5000, entryDate: '2026-11-02', description: 'Parent donation', party: 'Mr Ahmed' }),
  entry({ id: 'e3', entryNo: 'EXP-000002', kind: 'EXPENSE', category: { id: 'c2', name: 'Rent' }, amount: 99999, entryDate: '2026-11-01', description: 'Typo amount', voided: true, voidReason: 'Wrong amount' }),
];
const summary = {
  from: '2026-11-01', to: '2026-11-04', feeIncome: 10000, otherIncome: 5000, totalIncome: 15000, expenses: 24500, net: -9500,
  incomeByCategory: [{ categoryId: 'c3', name: 'Donations', amount: 5000, entries: 1 }],
  expenseByCategory: [{ categoryId: 'c2', name: 'Rent', amount: 21500, entries: 2 }, { categoryId: 'c1', name: 'Utilities', amount: 3000, entries: 1 }],
};
const months = Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, feeIncome: 0, otherIncome: 0, expenses: 0, net: 0 }));
months[10] = { month: '2026-11', feeIncome: 10000, otherIncome: 5000, expenses: 24500, net: -9500 };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderAt(path: string, user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/accounts/entries/e1/void') && m === 'POST') return json(200, { ...entries[0], voided: true, voidReason: 'Wrong amount' });
    if (url.includes('/accounts/entries') && m === 'POST') return json(201, { ...entries[0], id: 'e9', entryNo: 'EXP-000009' });
    if (url.includes('/accounts/entries')) return json(200, { entries, income: 5000, expense: 3000, truncated: false });
    if (url.includes('/accounts/categories/defaults') && m === 'POST') return json(200, { created: 9 });
    if (url.includes('/accounts/categories') && m === 'POST') return json(201, { id: 'c9', kind: 'INCOME', name: 'Zakat', isActive: true });
    if (url.includes('/accounts/categories')) {
      const kind = new URL(url, 'http://x').searchParams.get('kind');
      return json(200, kind ? categories.filter((c) => c.kind === kind) : categories);
    }
    if (url.includes('/accounts/reports/summary')) return json(200, summary);
    if (url.includes('/accounts/reports/monthly')) return json(200, { year: 2026, months });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={[path]}><Suspense fallback={null}>
        <Routes>
          <Route path="/app/accounts" element={<AccountsLedgerPage />} />
          <Route path="/app/accounts/categories" element={<AccountsCategoriesPage />} />
          <Route path="/app/accounts/reports" element={<AccountsReportsPage />} />
        </Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));

describe('accounts helpers', () => {
  it('computes the result, tone and date defaults', () => {
    expect(balanceOf(5000, 3000)).toBe(2000);
    expect(balanceOf(1000, 4000)).toBe(-3000);
    expect(kindTone('INCOME')).toBe('success');
    expect(kindTone('EXPENSE')).toBe('warning');
    expect(todayText(new Date(Date.UTC(2026, 10, 4)))).toBe('2026-11-04');
    expect(monthStartText(new Date(Date.UTC(2026, 10, 4)))).toBe('2026-11-01');
  });
});

describe('accounts pages', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { setAccessToken(null); vi.unstubAllGlobals(); });

  it('lists entries with totals, marks voided ones and strikes them out of the totals', async () => {
    renderAt('/app/accounts', accountant);
    expect(await screen.findByText('EXP-000001')).toBeInTheDocument();
    expect(screen.getByText('Mr Ahmed')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
    expect((await screen.findAllByText(/5,000/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Income minus expenses')).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument(); // 5000 - 3000, the voided 99,999 is not in the server totals
  });

  it('adds an expense with the exact payload', async () => {
    renderAt('/app/accounts', accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    await userEvent.type(await screen.findByLabelText('Amount (Rs)'), '2,500');
    await userEvent.type(screen.getByLabelText('Description'), 'Generator diesel');
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(sent('POST', '/accounts/entries')).toBeTruthy());
    expect(body('POST', '/accounts/entries')).toEqual({
      kind: 'EXPENSE', categoryId: 'c1', amount: 2500, method: 'CASH', entryDate: todayText(), description: 'Generator diesel', party: null, reference: null,
    });
  });

  it('keeps Save disabled until the amount and description are valid, and only offers active categories of the chosen type', async () => {
    renderAt('/app/accounts', accountant);
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    const save = screen.getByRole('button', { name: 'Save entry' });
    expect(save).toBeDisabled();
    await userEvent.type(await screen.findByLabelText('Amount (Rs)'), '12.5');
    expect(await screen.findByText('Enter a whole number above 0')).toBeInTheDocument();
    const dialog = within(screen.getByRole('dialog')); // the page behind has filters with the same labels
    await userEvent.selectOptions(dialog.getByLabelText('Type'), 'INCOME');
    const options = dialog.getByLabelText('Category') as HTMLSelectElement;
    expect([...options.options].map((o) => o.textContent)).toEqual(['Donations']); // "Old income" is inactive
    expect(save).toBeDisabled();
  });

  it('voids an entry after asking for a reason', async () => {
    renderAt('/app/accounts', accountant);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Void' }))[0]!);
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 'Wrong amount');
    await userEvent.click(confirm);
    await waitFor(() => expect(sent('POST', '/accounts/entries/e1/void')).toBeTruthy());
    expect(body('POST', '/accounts/entries/e1/void')).toEqual({ reason: 'Wrong amount' });
  });

  it('read-only users see the ledger without add or void buttons', async () => {
    renderAt('/app/accounts', viewer);
    await screen.findByText('EXP-000001');
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull();
  });

  it('shows categories per type, adds one and adds the common ones', async () => {
    renderAt('/app/accounts/categories', accountant);
    expect(await screen.findByText('Utilities')).toBeInTheDocument();
    expect(screen.getByText('Donations')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    await userEvent.type(screen.getAllByLabelText('New category')[0]!, 'Zakat'); // first card = income
    await userEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!);
    await waitFor(() => expect(sent('POST', '/accounts/categories')).toBeTruthy());
    expect(body('POST', '/accounts/categories')).toEqual({ kind: 'INCOME', name: 'Zakat' });
    await userEvent.click(screen.getByRole('button', { name: 'Add common categories' }));
    await waitFor(() => expect(sent('POST', '/accounts/categories/defaults')).toBeTruthy());
    expect(await screen.findByText('9 categories added')).toBeInTheDocument();
  });

  it('read-only users cannot change categories', async () => {
    renderAt('/app/accounts/categories', viewer);
    await screen.findByText('Utilities');
    expect(screen.queryByRole('button', { name: 'Add common categories' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });

  it('shows the report: fee income, totals, breakdown by category and the month table', async () => {
    renderAt('/app/accounts/reports', accountant);
    expect(await screen.findByText('Fee income', { selector: 'p' })).toBeInTheDocument();
    expect((await screen.findAllByText(/10,000/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/9,500/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Income by category')).toBeInTheDocument();
    expect(await screen.findByText('2026-11')).toBeInTheDocument();
    expect(sent('GET', '/accounts/reports/monthly')).toBeTruthy();
  });
});
