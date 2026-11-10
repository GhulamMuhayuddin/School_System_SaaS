import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { ClassSubjectsModal } from '@/features/academics/class-subjects-modal';
import { useClassActions, useClasses, type ClassDto } from '@/features/students/students-api';

type Dialog = { kind: 'class'; cls?: ClassDto } | { kind: 'section'; cls: ClassDto; section?: ClassDto['sections'][number] } | null;

function NameModal({ dialog, onClose }: { dialog: NonNullable<Dialog>; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useClassActions();
  const editing = dialog.kind === 'class' ? dialog.cls : dialog.section;
  const [name, setName] = useState(editing?.name ?? '');
  const [num, setNum] = useState(dialog.kind === 'class' ? String(dialog.cls?.level ?? 0) : dialog.section?.capacity?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const numValue = num.trim() === '' ? null : Number(num);
  const numOk = dialog.kind === 'class' ? numValue !== null && Number.isInteger(numValue) && numValue >= 0 : numValue === null || (Number.isInteger(numValue) && numValue > 0);
  const busy = Object.values(a).some((m) => m.isPending);

  const save = async () => {
    setError(null);
    try {
      if (dialog.kind === 'class') {
        if (dialog.cls) await a.updateClass.mutateAsync({ id: dialog.cls.id, name: name.trim(), level: numValue ?? 0 });
        else await a.createClass.mutateAsync({ name: name.trim(), level: numValue ?? 0 });
      } else if (dialog.section) await a.updateSection.mutateAsync({ id: dialog.section.id, name: name.trim(), capacity: numValue });
      else await a.createSection.mutateAsync({ classId: dialog.cls.id, name: name.trim(), capacity: numValue });
      toast.success(t('platform.detail.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };
  const title = dialog.kind === 'class' ? (dialog.cls ? t('academics.editClass') : t('academics.addClass')) : (dialog.section ? t('academics.editSection') : t('academics.addSection', { name: dialog.cls.name }));
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={!name.trim() || !numOk} loading={busy}>{t('platform.save')}</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
        <Field id="cl-name" label={t('academics.name')}><Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={dialog.kind === 'class' ? 'Class 5' : 'A'} /></Field>
        <Field id="cl-num" label={dialog.kind === 'class' ? t('academics.level') : t('academics.capacity')} hint={dialog.kind === 'class' ? t('academics.levelHint') : t('academics.capacityHint')}>
          <Input id="cl-num" type="number" min={dialog.kind === 'class' ? 0 : 1} dir="ltr" value={num} onChange={(e) => setNum(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function ClassesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useClasses();
  const a = useClassActions();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [subjectsFor, setSubjectsFor] = useState<ClassDto | null>(null);
  const manage = can('academic.manage');
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <div>
      <PageHeader title={t('academics.title')} subtitle={t('academics.subtitle')}
        action={manage ? <Button onClick={() => setDialog({ kind: 'class' })}><Plus className="size-4" aria-hidden />{t('academics.addClass')}</Button> : undefined} />
      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading || !data ? <Skeleton className="h-48" />
        : data.length === 0 ? <EmptyState title={t('academics.emptyTitle')} description={t('academics.emptyBody')} />
        : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div><h2 className="text-base font-extrabold text-navy-900">{c.name}</h2><p className="text-xs text-muted">{t('academics.studentsCount', { count: c.studentCount })}</p></div>
                  {manage && (
                    <div className="flex">
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'class', cls: c })}>{t('platform.detail.edit')}</Button>
                      <Button size="sm" variant="ghost" aria-label={t('academics.deleteClass', { name: c.name })} onClick={() => a.deleteClass.mutateAsync(c.id).then(() => toast.success(t('academics.deleted'))).catch(fail)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                    </div>
                  )}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {c.sections.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-control bg-canvas px-3 py-2 text-sm">
                      <span><strong>{s.name}</strong><span className="text-muted"> · {t('academics.studentsCount', { count: s.studentCount })}{s.capacity ? ` / ${s.capacity}` : ''}</span></span>
                      {manage && (
                        <span className="flex">
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'section', cls: c, section: s })}>{t('platform.detail.edit')}</Button>
                          <Button size="sm" variant="ghost" aria-label={t('academics.deleteSection', { name: s.name })} onClick={() => a.deleteSection.mutateAsync(s.id).then(() => toast.success(t('academics.deleted'))).catch(fail)}><Trash2 className="size-4 text-rose-600" aria-hidden /></Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {manage && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'section', cls: c })}><Plus className="size-4" aria-hidden />{t('academics.addSectionShort')}</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setSubjectsFor(c)}>{t('classSubjects.button')}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      {dialog && <NameModal dialog={dialog} onClose={() => setDialog(null)} />}
      {subjectsFor && <ClassSubjectsModal cls={subjectsFor} canEdit={manage} onClose={() => setSubjectsFor(null)} />}
    </div>
  );
}
