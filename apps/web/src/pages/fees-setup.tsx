import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import {
  fmtMoney, parseRupees, useCreateHead, useFeeHeads, useSetStructure, useStructure, useUpdateHead, type ClassStructure, type FeeFrequency,
} from '@/features/fees/fees-api';
import { FeesTabs } from '@/features/fees/fees-tabs';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

interface Row { feeHeadId: string; amount: string; frequency: FeeFrequency }

function StructureEditor({ data, canEdit }: { data: ClassStructure; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const heads = useFeeHeads();
  const save = useSetStructure(data.classId);
  const [rows, setRows] = useState<Row[]>(data.items.map((i) => ({ feeHeadId: i.feeHeadId, amount: String(i.amount), frequency: i.frequency })));
  const usable = (heads.data ?? []).filter((h) => h.isActive || rows.some((r) => r.feeHeadId === h.id));
  const parsed = rows.map((r) => parseRupees(r.amount));
  const dup = new Set(rows.map((r) => r.feeHeadId)).size !== rows.length;
  const valid = !dup && parsed.every((n) => n !== null) && rows.every((r) => r.feeHeadId);
  const total = (f: FeeFrequency) => rows.reduce((n, r, i) => (r.frequency === f ? n + (parsed[i] ?? 0) : n), 0);
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const submit = async () => {
    try {
      await save.mutateAsync(rows.map((r, i) => ({ feeHeadId: r.feeHeadId, amount: parsed[i] as number, frequency: r.frequency })));
      toast.success(t('fees.structureSaved'));
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  const free = usable.find((h) => !rows.some((r) => r.feeHeadId === h.id));
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p className="text-sm text-muted">{t('fees.noStructure')}</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
          <Select aria-label={t('fees.head')} value={r.feeHeadId} disabled={!canEdit} onChange={(e) => patch(i, { feeHeadId: e.target.value })}>
            {usable.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Input aria-label={t('fees.amount')} inputMode="numeric" dir="ltr" value={r.amount} disabled={!canEdit} onChange={(e) => patch(i, { amount: e.target.value })} />
          <Select aria-label={t('fees.frequency')} value={r.frequency} disabled={!canEdit} onChange={(e) => patch(i, { frequency: e.target.value as FeeFrequency })}>
            <option value="MONTHLY">{t('fees.frequencies.MONTHLY')}</option><option value="ONE_TIME">{t('fees.frequencies.ONE_TIME')}</option>
          </Select>
          {canEdit ? <Button variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{t('fees.remove')}</Button> : null}
        </div>
      ))}
      {dup ? <p className="text-sm text-rose-700">{t('fees.duplicateHead')}</p> : null}
      <p className="text-sm text-muted">{t('fees.monthlyTotal')}: <span dir="ltr">{fmtMoney(total('MONTHLY'), i18n.language)}</span> · {t('fees.oneTimeTotal')}: <span dir="ltr">{fmtMoney(total('ONE_TIME'), i18n.language)}</span></p>
      {canEdit ? (
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!free} onClick={() => free && setRows((rs) => [...rs, { feeHeadId: free.id, amount: '', frequency: 'MONTHLY' }])}>{t('fees.addLine')}</Button>
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!valid}>{t('fees.save')}</Button>
        </div>
      ) : null}
    </div>
  );
}

export default function FeesSetupPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can('fee.manage');
  const classes = useClasses();
  const heads = useFeeHeads();
  const create = useCreateHead();
  const update = useUpdateHead();
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const cls = classId || classes.data?.[0]?.id;
  const structure = useStructure(cls);
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  return (
    <div>
      <PageHeader title={t('fees.title')} subtitle={t('fees.setupSubtitle')} />
      <FeesTabs />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-navy-900">{t('fees.heads')}</h2>
          <ul className="mb-4 divide-y divide-line text-sm">
            {(heads.data ?? []).map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">{h.name}{h.isActive ? null : <Badge tone="neutral">{t('fees.inactive')}</Badge>}</span>
                {canEdit ? <Button size="sm" variant="ghost" onClick={() => void update.mutateAsync({ id: h.id, isActive: !h.isActive }).catch(fail)}>{h.isActive ? t('fees.deactivate') : t('fees.activate')}</Button> : null}
              </li>
            ))}
            {heads.data?.length === 0 ? <li className="py-2 text-muted">{t('fees.noHeads')}</li> : null}
          </ul>
          {canEdit ? (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Field id="head-name" label={t('fees.newHead')}><Input id="head-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field></div>
              <Button loading={create.isPending} disabled={name.trim().length < 2}
                onClick={() => void create.mutateAsync(name.trim()).then(() => setName(''), fail)}>{t('fees.addHead')}</Button>
            </div>
          ) : null}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-navy-900">{t('fees.structure')}</h2>
          <div className="mb-4 max-w-xs">
            <Field id="st-class" label={t('fees.class')}>
              <Select id="st-class" value={cls ?? ''} onChange={(e) => setClassId(e.target.value)}>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
          </div>
          {structure.data ? <StructureEditor key={`${structure.data.classId}-${structure.dataUpdatedAt}`} data={structure.data} canEdit={canEdit} />
            : structure.error ? <p className="text-sm text-rose-700">{platformError(t, structure.error)}</p> : null}
        </Card>
      </div>
    </div>
  );
}
