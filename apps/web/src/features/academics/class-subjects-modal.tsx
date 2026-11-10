import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { useClassSubjects, useSubjectActions, useSubjects } from './academics-api';

/** Tick the subjects a class studies. Read-only for users who cannot manage academics. */
export function ClassSubjectsModal({ cls, canEdit, onClose }: { cls: { id: string; name: string }; canEdit: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const subjects = useSubjects();
  const current = useClassSubjects(cls.id);
  const actions = useSubjectActions();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current.data && selected === null) setSelected(new Set(current.data.subjects.map((s) => s.id)));
  }, [current.data, selected]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setError(null);
    try {
      await actions.setForClass.mutateAsync({ classId: cls.id, subjectIds: [...(selected ?? [])] });
      toast.success(t('classSubjects.saved'));
      onClose();
    } catch (e) {
      setError(platformError(t, e));
    }
  };

  const loading = subjects.isLoading || current.isLoading || selected === null;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('classSubjects.title', { name: cls.name })} description={canEdit ? t('classSubjects.help') : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>{canEdit && <Button onClick={() => void save()} loading={actions.setForClass.isPending} disabled={loading}>{t('classSubjects.save')}</Button>}</>}>
      {error && <p role="alert" className="mb-3 rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      {loading ? <Skeleton className="h-24" />
        : (subjects.data ?? []).length === 0 ? <p className="text-sm text-muted">{t('classSubjects.none')}</p>
        : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(subjects.data ?? []).map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-control bg-canvas px-3 py-2 text-sm font-medium text-navy-900">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={selected?.has(s.id) ?? false} disabled={!canEdit} onChange={() => toggle(s.id)} />
                  {s.name}
                </label>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
