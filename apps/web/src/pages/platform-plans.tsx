import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { PageHeader, platformError } from '@/features/platform/common';
import { usePlans, useSavePlan, type Plan } from '@/features/platform/platform-api';

const toInt = (s: string): number | null => (s.trim() === '' ? null : Number.parseInt(s, 10));

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSavePlan();
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan ? String(plan.priceMonthly) : '0');
  const [students, setStudents] = useState(plan?.maxStudents?.toString() ?? '');
  const [staff, setStaff] = useState(plan?.maxStaff?.toString() ?? '');
  const [active, setActive] = useState(plan?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const studentsNum = toInt(students);
  const staffNum = toInt(staff);
  const invalid =
    !name.trim() || price.trim() === '' || !Number.isFinite(priceNum) || priceNum < 0 ||
    (studentsNum !== null && !(studentsNum > 0)) || (staffNum !== null && !(staffNum > 0));

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ id: plan?.id, name: name.trim(), priceMonthly: priceNum, maxStudents: studentsNum, maxStaff: staffNum, isActive: active });
      toast.success(t('platform.plans.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={plan ? t('platform.plans.editTitle') : t('platform.plans.addTitle')} description={t('platform.plans.desc')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} disabled={invalid} loading={save.isPending}>{t('platform.save')}</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <Field id="pl-name" label={t('platform.plans.name')}><Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="pl-price" label={t('platform.plans.price')}><Input id="pl-price" type="number" min={0} step="0.01" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pl-stu" label={t('platform.plans.maxStudents')} hint={t('platform.plans.unlimitedHint')}><Input id="pl-stu" type="number" min={1} dir="ltr" value={students} onChange={(e) => setStudents(e.target.value)} /></Field>
          <Field id="pl-staff" label={t('platform.plans.maxStaff')} hint={t('platform.plans.unlimitedHint')}><Input id="pl-staff" type="number" min={1} dir="ltr" value={staff} onChange={(e) => setStaff(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <input type="checkbox" className="size-4 accent-brand-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('platform.plans.active')}
        </label>
        <p className="text-xs text-muted">{t('platform.plans.limitNote')}</p>
      </div>
    </Modal>
  );
}

export default function PlatformPlansPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error, refetch } = usePlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const columns: Column<Plan>[] = [
    { key: 'name', header: t('platform.plans.name'), sortValue: (r) => r.name, cell: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'price', header: t('platform.plans.price'), sortValue: (r) => r.priceMonthly, cell: (r) => fmtNumber(r.priceMonthly, i18n.language), className: 'text-end' },
    { key: 'students', header: t('platform.plans.maxStudents'), cell: (r) => (r.maxStudents == null ? null : fmtNumber(r.maxStudents, i18n.language)) ?? t('platform.plans.unlimited') },
    { key: 'staff', header: t('platform.plans.maxStaff'), cell: (r) => (r.maxStaff == null ? null : fmtNumber(r.maxStaff, i18n.language)) ?? t('platform.plans.unlimited') },
    { key: 'schools', header: t('platform.plans.schools'), sortValue: (r) => r.schoolCount, cell: (r) => r.schoolCount, className: 'text-end' },
    { key: 'active', header: t('platform.schools.status'), cell: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? t('platform.plans.activeBadge') : t('platform.plans.inactiveBadge')}</Badge> },
    { key: 'edit', header: '', cell: (r) => <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{t('platform.detail.edit')}</Button> },
  ];
  return (
    <div>
      <PageHeader title={t('platform.plans.title')} subtitle={t('platform.plans.subtitle')}
        action={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('platform.plans.add')}</Button>} />
      <DataTable columns={columns} rows={data ?? []} rowKey={(r) => r.id} loading={isLoading} error={error ? platformError(t, error) : null} onRetry={() => void refetch()}
        emptyTitle={t('platform.plans.emptyTitle')} emptyDescription={t('platform.plans.emptyBody')} />
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
