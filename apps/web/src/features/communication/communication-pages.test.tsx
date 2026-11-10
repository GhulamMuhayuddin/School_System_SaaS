import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import type { SessionUser } from '@/lib/api';
import CommunicationPage from '@/pages/communication';
import { formValid, statusTone } from './communication-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Pri', lastName: 'Ncipal', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const principal = make(['communication.read', 'communication.send']);
const parent = make(['communication.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const n1 = { id: 'a1', title: 'Sports day', body: 'Sports day is on Friday.\nWear the house colour.', audience: 'ALL', className: null, priority: 'IMPORTANT', publishedAt: '2026-11-04T09:00:00Z', expiresOn: null, author: 'Pri Ncipal', read: false };
const n2 = { id: 'a2', title: 'Class 5 trip', body: 'Bring Rs 500.', audience: 'CLASS', className: 'Class 5', priority: 'NORMAL', publishedAt: '2026-11-03T09:00:00Z', expiresOn: '2026-11-10', author: 'Pri Ncipal', read: true };
const sentRow = { ...n1, read: undefined, status: 'LIVE', readCount: 12 };

function setup(user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.includes('/communication/announcements/read-all')) return json(200, { marked: 1 });
    if (url.includes('/communication/announcements/a1/read')) return json(204);
    if (url.includes('/communication/announcements/a1/withdraw')) return json(200, { ...sentRow, status: 'WITHDRAWN' });
    if (url.includes('/communication/announcements') && m === 'POST') return json(201, sentRow);
    if (url.includes('/communication/announcements')) return json(200, { announcements: url.includes('unreadOnly') ? [n1] : [n1, n2], unread: 1 });
    if (url.includes('/communication/sent')) return json(200, { announcements: [sentRow], truncated: false });
    if (url.includes('/academics/classes')) return json(200, { classes: [{ id: 'c5', name: 'Class 5', level: 5, studentCount: 30, sections: [] }] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/communication']}><Suspense fallback={null}>
        <Routes><Route path="/app/communication" element={<CommunicationPage />} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));

describe('communication helpers', () => {
  it('a form is complete with a title, a message and (for a class) a class', () => {
    expect(formValid({ title: 'Sports day', body: 'On Friday', audience: 'ALL', classId: '' })).toBe(true);
    expect(formValid({ title: 'ab', body: 'On Friday', audience: 'ALL', classId: '' })).toBe(false);
    expect(formValid({ title: 'Sports day', body: '  ', audience: 'ALL', classId: '' })).toBe(false);
    expect(formValid({ title: 'Trip', body: 'Bring Rs 500', audience: 'CLASS', classId: '' })).toBe(false);
    expect(formValid({ title: 'Trip', body: 'Bring Rs 500', audience: 'CLASS', classId: 'c5' })).toBe(true);
  });
  it('colours the status', () => {
    expect(statusTone('LIVE')).toBe('success');
    expect(statusTone('EXPIRED')).toBe('neutral');
    expect(statusTone('WITHDRAWN')).toBe('danger');
  });
});

describe('communication page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a parent reads the inbox: unread first with a New badge, the class notice shows its class', async () => {
    setup(parent);
    expect(await screen.findByText('Sports day')).toBeInTheDocument();
    expect(screen.getByText('1 unread announcement')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText(/Class: Class 5/)).toBeInTheDocument();
    expect(screen.getByText(/Wear the house colour/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Communication sections' })).not.toBeInTheDocument(); // no Send tab for a parent
    expect(screen.queryByRole('button', { name: 'New announcement' })).not.toBeInTheDocument();
  });

  it('marks one as read and all as read', async () => {
    setup(parent);
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(sent('POST', '/communication/announcements/a1/read')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(sent('POST', '/communication/announcements/read-all')).toBeTruthy());
  });

  it('filters to unread only', async () => {
    setup(parent);
    await screen.findByText('Class 5 trip');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Unread only' }));
    await waitFor(() => expect(screen.queryByText('Class 5 trip')).not.toBeInTheDocument());
    expect(screen.getByText('Sports day')).toBeInTheDocument();
  });

  it('the principal publishes an announcement to one class', async () => {
    setup(principal);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Communication sections' })).getByRole('button', { name: 'Send and manage' }));
    await userEvent.click(await screen.findByRole('button', { name: 'New announcement' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Class 5 trip');
    await userEvent.type(within(dialog).getByLabelText('Message'), 'Bring Rs 500.');
    await userEvent.selectOptions(within(dialog).getByLabelText('Send to'), 'CLASS');
    expect(within(dialog).getByRole('button', { name: 'Publish' })).toBeDisabled(); // a class is still missing
    await userEvent.selectOptions(await within(dialog).findByLabelText('Class'), 'c5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(sent('POST', '/communication/announcements')).toBeTruthy());
    expect(body('POST', '/communication/announcements')).toEqual({ title: 'Class 5 trip', body: 'Bring Rs 500.', audience: 'CLASS', classId: 'c5', priority: 'NORMAL', expiresOn: null });
  });

  it('shows the sent list with the read count and withdraws after a confirmation', async () => {
    setup(principal);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Communication sections' })).getByRole('button', { name: 'Send and manage' }));
    expect(await screen.findByText('Showing')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(sent('POST', '/communication/announcements/a1/withdraw')).toBeTruthy());
  });
});
