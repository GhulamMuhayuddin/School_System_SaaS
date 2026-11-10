import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-context';
import { todayText } from '@/features/hr/hr-api';
import type { SessionUser } from '@/lib/api';
import InventoryPage from '@/pages/inventory';
import { deltaText, parseCost, parseQty, stockAfter, stockTone } from './inventory-api';

const make = (permissions: string[]): SessionUser => ({
  id: 'me', email: 'me@school.test', firstName: 'Store', lastName: 'Keeper', preferredLang: 'en',
  role: { id: 'r', key: 'x', name: 'x' }, school: { id: 's1', name: 'City School', code: 'city' }, permissions,
});
const keeper = make(['inventory.read', 'inventory.manage']);
const viewer = make(['inventory.read']);
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

const chalk = { id: 'i1', code: 'I-000001', name: 'Chalk box', category: 'Stationery', unit: 'box', quantity: 4, reorderLevel: 5, unitCost: 130, value: 520, low: true, location: 'Store room', notes: null, active: true };
const pens = { id: 'i2', code: 'I-000002', name: 'Pens', category: null, unit: 'pcs', quantity: 0, reorderLevel: 0, unitCost: 0, value: 0, low: false, location: null, notes: null, active: true };
const move = { id: 'm1', item: { id: 'i1', code: 'I-000001', name: 'Chalk box', unit: 'box' }, kind: 'OUT', delta: -14, balanceAfter: 4, unitCost: null, party: 'Class 5 teacher', reference: 'REQ-1', note: null, movedOn: '2026-11-03', createdAt: '2026-11-03T09:00:00Z' };

function setup(user: SessionUser) {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url, init) => {
    const m = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 't', expiresIn: 900, user });
    if (url.endsWith('/inventory/summary')) return json(200, { items: 2, lowItems: 1, outOfStock: 1, totalValue: 520 });
    if (url.endsWith('/inventory/categories')) return json(200, { categories: ['Stationery'] });
    if (url.includes('/inventory/items/i1/stock') && m === 'POST') return json(201, { item: { ...chalk, quantity: 14 }, movements: [] });
    if (url.includes('/inventory/items') && m === 'POST') return json(201, chalk);
    if (url.includes('/inventory/items')) return json(200, { items: [chalk, pens], truncated: false });
    if (url.includes('/inventory/movements')) return json(200, { movements: [move], truncated: false });
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><AuthProvider><MemoryRouter initialEntries={['/app/inventory']}><Suspense fallback={null}>
        <Routes><Route path="/app/inventory" element={<InventoryPage />} /></Routes>
      </Suspense></MemoryRouter></AuthProvider></ToastProvider>
    </QueryClientProvider>,
  );
}
const sent = (method: string, part: string) => fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === method && String(c[0]).includes(part));
const body = (method: string, part: string) => JSON.parse(String(sent(method, part)![1]!.body));

describe('inventory helpers', () => {
  it('checks quantities and costs like the server', () => {
    expect(parseQty('12')).toBe(12);
    expect(parseQty('1,000,000')).toBe(1_000_000);
    expect(parseQty('1000001')).toBeNull();
    expect(parseQty('2.5')).toBeNull();
    expect(parseQty('-1')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(parseCost('')).toBe(0);
    expect(parseCost('1,250')).toBe(1250);
    expect(parseCost('1.5')).toBeNull();
  });
  it('works out the stock after a movement and refuses what the server refuses', () => {
    expect(stockAfter(10, 'IN', 5)).toBe(15);
    expect(stockAfter(10, 'OUT', 4)).toBe(6);
    expect(stockAfter(10, 'OUT', 11)).toBeNull();
    expect(stockAfter(10, 'ADJUST', 7)).toBe(7);
    expect(stockAfter(10, 'ADJUST', 10)).toBeNull();
    expect(stockAfter(10, 'IN', 0)).toBeNull();
    expect(stockAfter(10, 'IN', null)).toBeNull();
  });
  it('colours stock and signs changes', () => {
    expect(stockTone({ quantity: 0, low: false })).toBe('danger');
    expect(stockTone({ quantity: 4, low: true })).toBe('warning');
    expect(stockTone({ quantity: 40, low: false })).toBe('success');
    expect(deltaText(5)).toBe('+5');
    expect(deltaText(-3)).toBe('-3');
  });
});

describe('inventory page', () => {
  beforeEach(() => { fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows the summary and items with low and empty stock', async () => {
    setup(keeper);
    expect(await screen.findByRole('button', { name: 'Chalk box' })).toBeInTheDocument();
    expect(await screen.findByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('4 box')).toBeInTheDocument();
    expect(screen.getByText('0 pcs')).toBeInTheDocument();
  });

  it('receives stock with a supplier and a price', async () => {
    setup(keeper);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Receive' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Quantity received'), '10');
    expect(within(dialog).getByText('Stock will be 14 box')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Cost per unit (Rs)'), '130');
    await userEvent.type(within(dialog).getByLabelText('Supplier'), 'Ali Traders');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Receive' }));
    await waitFor(() => expect(sent('POST', '/inventory/items/i1/stock')).toBeTruthy());
    expect(body('POST', '/inventory/items/i1/stock')).toEqual({ kind: 'IN', quantity: 10, unitCost: 130, party: 'Ali Traders', reference: null, note: null, movedOn: todayText() });
  });

  it('refuses to issue more than is in stock before sending anything', async () => {
    setup(keeper);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Issue' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Quantity issued'), '9');
    expect(await within(dialog).findByText('Only 4 box in stock')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Issue' })).toBeDisabled();
    expect(sent('POST', '/inventory/items/i1/stock')).toBeUndefined();
  });

  it('cannot issue from an empty item', async () => {
    setup(keeper);
    await screen.findByText('0 pcs');
    expect(screen.getAllByRole('button', { name: 'Issue' })[1]).toBeDisabled();
  });

  it('adds an item with opening stock', async () => {
    setup(keeper);
    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    await userEvent.type(await screen.findByLabelText('Item name'), 'Markers');
    await userEvent.type(screen.getByLabelText('Opening stock'), '24');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent('POST', '/inventory/items')).toBeTruthy());
    expect(body('POST', '/inventory/items')).toEqual({ name: 'Markers', category: null, unit: 'pcs', reorderLevel: 0, unitCost: 0, location: null, notes: null, openingQuantity: 24 });
  });

  it('lists movements', async () => {
    setup(keeper);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Inventory sections' })).getByRole('button', { name: 'Movements' }));
    expect(await screen.findByText('Class 5 teacher')).toBeInTheDocument();
    expect(screen.getByText('-14 box')).toBeInTheDocument();
    expect(screen.getAllByText('Issued').length).toBeGreaterThan(0); // the badge and the filter option
  });

  it('a read-only user sees no buttons that change stock', async () => {
    setup(viewer);
    expect(await screen.findByText('Chalk box')).toBeInTheDocument();
    for (const name of ['Add item', 'Receive', 'Issue', 'Count']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
});
