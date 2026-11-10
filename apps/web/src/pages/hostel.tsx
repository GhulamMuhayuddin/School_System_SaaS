import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import {
  bedTone, useHostels, useHostelSummary, useRemoveResident, useResidents, useRooms, useUpdateHostel, useUpdateRoom, type Hostel, type Resident, type Room,
} from '@/features/hostel/hostel-api';
import { AssignModal, HostelFormModal, RoomFormModal } from '@/features/hostel/hostel-modals';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'hostels' | 'rooms' | 'residents';

function HostelsTab() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [retired, setRetired] = useState(false);
  const [editing, setEditing] = useState<Hostel | 'new' | null>(null);
  const hostels = useHostels(retired);
  const update = useUpdateHostel();
  const manage = can('hostel.manage');
  const toggle = (h: Hostel) => void update.mutateAsync({ id: h.id, patch: { active: !h.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<Hostel>[] = [
    { key: 'name', header: t('hostel.hostel'), sortValue: (h) => h.name, cell: (h) => (manage ? <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setEditing(h)}>{h.name}</button> : <b>{h.name}</b>) },
    { key: 'kind', header: t('hostel.kind'), sortValue: (h) => h.kind, cell: (h) => <Badge tone="neutral">{t(`hostel.kinds.${h.kind}`)}</Badge> },
    { key: 'warden', header: t('hostel.warden'), sortValue: (h) => h.wardenName ?? '', cell: (h) => (h.wardenName ? <span>{h.wardenName}{h.wardenPhone ? <span className="block text-xs text-muted" dir="ltr">{h.wardenPhone}</span> : null}</span> : '—') },
    { key: 'rooms', header: t('hostel.rooms'), sortValue: (h) => h.rooms, cell: (h) => <span dir="ltr">{h.rooms}</span> },
    { key: 'beds', header: t('hostel.residents'), sortValue: (h) => h.residents, cell: (h) => <Badge tone={h.residents > h.beds ? 'danger' : h.residents === h.beds && h.beds > 0 ? 'warning' : 'success'}><span dir="ltr">{h.residents} / {h.beds}</span></Badge> },
    ...(manage
      ? [{ key: 'active', header: t('hostel.status'), sortValue: (h: Hostel) => (h.active ? 1 : 0), cell: (h: Hostel) => <Button size="sm" variant="ghost" onClick={() => toggle(h)}>{h.active ? t('hostel.deactivate') : t('hostel.activate')}</Button> }]
      : [{ key: 'active', header: t('hostel.status'), sortValue: (h: Hostel) => (h.active ? 1 : 0), cell: (h: Hostel) => <Badge tone={h.active ? 'success' : 'neutral'}>{h.active ? t('hostel.active') : t('hostel.inactive')}</Badge> }]),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('hostel.showInactive')}</label>
        {manage ? <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('hostel.addHostel')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={hostels.data ?? []} rowKey={(h) => h.id} pageSize={15} searchText={(h) => `${h.name} ${h.wardenName ?? ''}`}
        loading={hostels.isLoading} error={hostels.error ? platformError(t, hostels.error) : null} onRetry={() => void hostels.refetch()}
        emptyTitle={t('hostel.hostelsEmptyTitle')} emptyDescription={t('hostel.hostelsEmptyBody')} />
      {editing ? <HostelFormModal key={editing === 'new' ? 'new' : editing.id} hostel={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RoomsTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [hostelId, setHostelId] = useState('');
  const [retired, setRetired] = useState(false);
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const hostels = useHostels();
  const rooms = useRooms({ hostelId, includeInactive: retired });
  const update = useUpdateRoom();
  const manage = can('hostel.manage');
  const toggle = (r: Room) => void update.mutateAsync({ id: r.id, patch: { active: !r.active } }).catch((e) => toast.error(t('platform.errors.generic'), platformError(t, e)));
  const columns: Column<Room>[] = [
    { key: 'room', header: t('hostel.room'), sortValue: (r) => `${r.hostelName} ${r.roomNo}`, cell: (r) => (manage ? <button type="button" className="text-start font-semibold text-brand-700 hover:underline" dir="ltr" onClick={() => setEditing(r)}>{r.roomNo}</button> : <b dir="ltr">{r.roomNo}</b>) },
    { key: 'hostel', header: t('hostel.hostel'), sortValue: (r) => r.hostelName, cell: (r) => r.hostelName },
    { key: 'floor', header: t('hostel.floor'), sortValue: (r) => r.floor ?? -99, cell: (r) => (r.floor === null ? '—' : <span dir="ltr">{r.floor}</span>) },
    { key: 'beds', header: t('hostel.beds'), sortValue: (r) => r.residents, cell: (r) => <Badge tone={bedTone(r.bedState)}><span dir="ltr">{r.residents} / {r.beds}</span></Badge> },
    { key: 'fee', header: t('hostel.monthlyFee'), sortValue: (r) => r.monthlyFee, cell: (r) => <span dir="ltr">{fmtMoney(r.monthlyFee, i18n.language)}</span> },
    ...(manage
      ? [{ key: 'active', header: t('hostel.status'), sortValue: (r: Room) => (r.active ? 1 : 0), cell: (r: Room) => <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? t('hostel.deactivate') : t('hostel.activate')}</Button> }]
      : [{ key: 'active', header: t('hostel.status'), sortValue: (r: Room) => (r.active ? 1 : 0), cell: (r: Room) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? t('hostel.active') : t('hostel.inactive')}</Badge> }]),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-48">
          <Field id="rm-filter" label={t('hostel.hostel')}>
            <Select id="rm-filter" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              <option value="">{t('hostel.allHostels')}</option>{(hostels.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('hostel.showInactiveRooms')}</label>
        {manage ? <Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('hostel.addRoom')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={rooms.data ?? []} rowKey={(r) => r.id} pageSize={20} searchText={(r) => `${r.roomNo} ${r.hostelName}`}
        loading={rooms.isLoading} error={rooms.error ? platformError(t, rooms.error) : null} onRetry={() => void rooms.refetch()}
        emptyTitle={t('hostel.roomsEmptyTitle')} emptyDescription={t('hostel.roomsEmptyBody')} />
      {editing ? <RoomFormModal key={editing === 'new' ? 'new' : editing.id} room={editing === 'new' ? undefined : editing} defaultHostelId={hostelId || undefined} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ResidentsTab() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [hostelId, setHostelId] = useState('');
  const [adding, setAdding] = useState(false);
  const hostels = useHostels();
  const residents = useResidents({ hostelId });
  const remove = useRemoveResident();
  const manage = can('hostel.manage');
  const columns: Column<Resident>[] = [
    { key: 'student', header: t('hostel.student'), sortValue: (r) => r.student.name, cell: (r) => <span>{r.student.name}<span className="block text-xs text-muted">{r.student.className ?? ''} · <span dir="ltr">{r.student.admissionNo}</span></span></span> },
    { key: 'hostel', header: t('hostel.hostel'), sortValue: (r) => r.hostel.name, cell: (r) => r.hostel.name },
    { key: 'room', header: t('hostel.room'), sortValue: (r) => r.room.roomNo, cell: (r) => <span dir="ltr">{r.room.roomNo}</span> },
    { key: 'since', header: t('hostel.sinceLabel'), sortValue: (r) => r.assignedOn, cell: (r) => fmtDate(r.assignedOn, i18n.language) },
    ...(manage ? [{ key: 'x', header: '', sortValue: () => '', cell: (r: Resident) => <Button size="sm" variant="ghost" onClick={() => void remove.mutateAsync(r.student.id).then(() => toast.success(t('hostel.removed')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('hostel.removeResident')}</Button> }] : []),
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Field id="rs-hostel" label={t('hostel.hostel')}>
            <Select id="rs-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
              <option value="">{t('hostel.allHostels')}</option>{(hostels.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
        </div>
        {manage ? <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('hostel.assign')}</Button> : null}
      </div>
      <DataTable columns={columns} rows={residents.data?.residents ?? []} rowKey={(r) => r.student.id} pageSize={20} searchText={(r) => `${r.student.name} ${r.student.admissionNo} ${r.hostel.name} ${r.room.roomNo}`}
        loading={residents.isLoading} error={residents.error ? platformError(t, residents.error) : null} onRetry={() => void residents.refetch()}
        emptyTitle={t('hostel.residentsEmptyTitle')} emptyDescription={t('hostel.residentsEmptyBody')} />
      {residents.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('hostel.truncated')}</p> : null}
      {adding ? <AssignModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

export default function HostelPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('hostels');
  const s = useHostelSummary().data;
  const chip = (label: string, value: string | number, warn = false) => (
    <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className={cn('text-xl font-extrabold', warn ? 'text-rose-700' : 'text-navy-900')} dir="ltr">{value}</p></Card>
  );
  const tabs: Tab[] = ['hostels', 'rooms', 'residents'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('hostel.title')} subtitle={t('hostel.subtitle')} />
      {s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {chip(t('hostel.hostels'), s.hostels)}{chip(t('hostel.beds'), s.beds)}{chip(t('hostel.residents'), s.residents)}
          {chip(t('hostel.freeBeds'), s.freeBeds)}{chip(t('hostel.monthlyIncome'), fmtMoney(s.monthlyIncome, i18n.language), s.overCapacity > 0)}
        </div>
      ) : null}
      <nav aria-label={t('hostel.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`hostel.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'hostels' && <HostelsTab />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'residents' && <ResidentsTab />}
    </div>
  );
}
