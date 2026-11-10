import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rangeArrow } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import {
  seatTone, useRiders, useRoutes, useTransportSummary, useUnassign, useUpdateRoute, useUpdateVehicle, useVehicles, type Rider, type Route, type Vehicle,
} from '@/features/transport/transport-api';
import { AssignModal, RouteFormModal, VehicleFormModal } from '@/features/transport/transport-modals';
import { cn } from '@/lib/cn';

type Tab = 'routes' | 'vehicles' | 'riders';

function RoutesTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [retired, setRetired] = useState(false);
  const [editing, setEditing] = useState<Route | 'new' | null>(null);
  const routes = useRoutes(retired);
  const update = useUpdateRoute();
  const manage = can('transport.manage');
  const toggle = (r: Route) => void update.mutateAsync({ id: r.id, patch: { active: !r.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<Route>[] = [
    { key: 'name', header: t('transport.route'), sortValue: (r) => r.name, cell: (r) => (manage ? <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setEditing(r)}>{r.name}</button> : <b>{r.name}</b>) },
    { key: 'stops', header: t('transport.stops'), sortValue: (r) => r.stops.length, cell: (r) => r.stops.map((s) => (s.pickupTime ? `${s.name} ${s.pickupTime}` : s.name)).join(` ${rangeArrow()} `) || '—' },
    { key: 'vehicle', header: t('transport.vehicle'), sortValue: (r) => r.vehicle?.registrationNo ?? '', cell: (r) => (r.vehicle ? <span dir="ltr">{r.vehicle.registrationNo}</span> : <Badge tone="neutral">{t('transport.noVehicle')}</Badge>) },
    { key: 'riders', header: t('transport.riders'), sortValue: (r) => r.riders, cell: (r) => <Badge tone={seatTone(r.seat)}><span dir="ltr">{r.riders}{r.vehicle ? ` / ${r.vehicle.capacity}` : ''}</span></Badge> },
    { key: 'fee', header: t('transport.monthlyFee'), sortValue: (r) => r.monthlyFee, cell: (r) => <span dir="ltr">{fmtMoney(r.monthlyFee, i18n.language)}</span> },
    ...(manage ? [{ key: 'active', header: t('transport.status'), sortValue: (r: Route) => (r.active ? 1 : 0), cell: (r: Route) => <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? t('transport.deactivate') : t('transport.activate')}</Button> }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('transport.showInactive')}</label>
        {manage ? <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('transport.addRoute')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={routes.data ?? []} rowKey={(r) => r.id} pageSize={15} searchText={(r) => `${r.name} ${r.stops.map((s) => s.name).join(' ')}`}
        loading={routes.isLoading} error={routes.error ? platformError(t, routes.error) : null} onRetry={() => void routes.refetch()}
        emptyTitle={t('transport.routesEmptyTitle')} emptyDescription={t('transport.routesEmptyBody')} />
      {editing ? <RouteFormModal key={editing === 'new' ? 'new' : editing.id} route={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function VehiclesTab() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const vehicles = useVehicles();
  const update = useUpdateVehicle();
  const manage = can('transport.manage');
  const toggle = (v: Vehicle) => void update.mutateAsync({ id: v.id, patch: { active: !v.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<Vehicle>[] = [
    { key: 'reg', header: t('transport.registration'), sortValue: (v) => v.registrationNo, cell: (v) => (manage ? <button type="button" className="font-semibold text-brand-700 hover:underline" dir="ltr" onClick={() => setEditing(v)}>{v.registrationNo}</button> : <b dir="ltr">{v.registrationNo}</b>) },
    { key: 'kind', header: t('transport.kind'), sortValue: (v) => v.kind, cell: (v) => v.kind },
    { key: 'seats', header: t('transport.seats'), sortValue: (v) => v.capacity, cell: (v) => <span dir="ltr">{v.riders} / {v.capacity}</span> },
    { key: 'driver', header: t('transport.driver'), sortValue: (v) => v.driverName ?? '', cell: (v) => (v.driverName ? <span>{v.driverName}{v.driverPhone ? <span className="block text-xs text-muted" dir="ltr">{v.driverPhone}</span> : null}</span> : '—') },
    { key: 'routes', header: t('transport.routes'), sortValue: (v) => v.routes.length, cell: (v) => v.routes.map((r) => r.name).join(', ') || '—' },
    { key: 'status', header: t('transport.status'), sortValue: (v) => (v.active ? 1 : 0), cell: (v) => (manage ? <Button size="sm" variant="ghost" onClick={() => toggle(v)}>{v.active ? t('transport.deactivate') : t('transport.activate')}</Button> : <Badge tone={v.active ? 'success' : 'neutral'}>{v.active ? t('transport.active') : t('transport.inactive')}</Badge>) },
  ];
  return (
    <div>
      {manage ? <Button className="mb-4" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('transport.addVehicle')}</Button> : null}
      <DataTable columns={columns} rows={vehicles.data ?? []} rowKey={(v) => v.id} pageSize={15} searchText={(v) => `${v.registrationNo} ${v.driverName ?? ''}`}
        loading={vehicles.isLoading} error={vehicles.error ? platformError(t, vehicles.error) : null} onRetry={() => void vehicles.refetch()}
        emptyTitle={t('transport.vehiclesEmptyTitle')} emptyDescription={t('transport.vehiclesEmptyBody')} />
      {editing ? <VehicleFormModal key={editing === 'new' ? 'new' : editing.id} vehicle={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RidersTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [routeId, setRouteId] = useState('');
  const [adding, setAdding] = useState(false);
  const routes = useRoutes();
  const riders = useRiders({ routeId });
  const remove = useUnassign();
  const manage = can('transport.manage');
  const columns: Column<Rider>[] = [
    { key: 'student', header: t('transport.student'), sortValue: (r) => r.student.name, cell: (r) => <span>{r.student.name}<span className="block text-xs text-muted">{r.student.className ?? ''} · <span dir="ltr">{r.student.admissionNo}</span></span></span> },
    { key: 'route', header: t('transport.route'), sortValue: (r) => r.route.name, cell: (r) => r.route.name },
    { key: 'stop', header: t('transport.stop'), sortValue: (r) => r.stop.name, cell: (r) => r.stop.name },
    { key: 'since', header: t('transport.sinceLabel'), sortValue: (r) => r.assignedOn, cell: (r) => fmtDate(r.assignedOn, i18n.language) },
    ...(manage ? [{ key: 'x', header: '', sortValue: () => '', cell: (r: Rider) => <Button size="sm" variant="ghost" onClick={() => void remove.mutateAsync(r.student.id).then(() => toast.success(t('transport.removed')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('transport.removeRider')}</Button> }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Field id="rd-route" label={t('transport.route')}>
            <Select id="rd-route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">{t('transport.allRoutes')}</option>{(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </div>
        {manage ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('transport.assign')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={riders.data?.riders ?? []} rowKey={(r) => r.student.id} pageSize={20} searchText={(r) => `${r.student.name} ${r.student.admissionNo} ${r.route.name} ${r.stop.name}`}
        loading={riders.isLoading} error={riders.error ? platformError(t, riders.error) : null} onRetry={() => void riders.refetch()}
        emptyTitle={t('transport.ridersEmptyTitle')} emptyDescription={t('transport.ridersEmptyBody')} />
      {riders.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('transport.truncated')}</p> : null}
      {adding ? <AssignModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

export default function TransportPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('routes');
  const s = useTransportSummary().data;
  const chip = (label: string, value: string | number, warn = false) => (
    <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className={cn('text-xl font-extrabold', warn ? 'text-rose-700' : 'text-navy-900')} dir="ltr">{value}</p></Card>
  );
  const tabs: Tab[] = ['routes', 'vehicles', 'riders'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('transport.title')} subtitle={t('transport.subtitle')} />
      {s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {chip(t('transport.routes'), s.routes)}{chip(t('transport.vehicles'), s.vehicles)}{chip(t('transport.riders'), s.riders)}
          {chip(t('transport.monthlyIncome'), fmtMoney(s.monthlyIncome, i18n.language))}{chip(t('transport.needsAttention'), s.routesWithoutVehicle + s.overCapacity, s.routesWithoutVehicle + s.overCapacity > 0)}
        </div>
      ) : null}
      <nav aria-label={t('transport.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`transport.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'routes' && <RoutesTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'riders' && <RidersTab />}
    </div>
  );
}
