import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useClassSubjects } from '@/features/academics/academics-api';
import { platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';
import { todayText, useCreateHomework, useUpdateHomework, type HomeworkDetail } from './homework-api';

const marksOk = (v: string): boolean => v.trim() === '' || (/^\d{1,4}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 1000);

/** Add homework (existing = undefined) or change title, description, due date and maximum marks of an existing one. */
export function HomeworkFormModal({ open, onClose, existing, onCreated }: { open: boolean; onClose: () => void; existing?: HomeworkDetail; onCreated?: (id: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateHomework();
  const update = useUpdateHomework();
  const classes = useClasses();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? todayText());
  const [maxMarks, setMaxMarks] = useState(existing?.maxMarks != null ? String(existing.maxMarks) : '');
  const cls = classes.data?.find((c) => c.id === classId) ?? classes.data?.[0];
  const section = cls?.sections.find((s) => s.id === sectionId) ?? cls?.sections[0];
  const subjects = useClassSubjects(existing ? undefined : cls?.id);
  const subject = subjects.data?.subjects.find((s) => s.id === subjectId) ?? subjects.data?.subjects[0];
  const valid = title.trim().length >= 3 && dueDate !== '' && marksOk(maxMarks) && (existing ? true : Boolean(section && subject));
  const submit = async () => {
    if (!valid) return;
    const marks = maxMarks.trim() === '' ? null : Number(maxMarks);
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: { title: title.trim(), description: description.trim() || null, dueDate, maxMarks: marks } });
        toast.success(t('homework.updated'));
      } else {
        const hw = await create.mutateAsync({ sectionId: section!.id, subjectId: subject!.id, title: title.trim(), description: description.trim() || null, dueDate, maxMarks: marks });
        toast.success(t('homework.created'));
        onCreated?.(hw.id);
      }
      onClose();
    } catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  const busy = create.isPending || update.isPending;
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={existing ? t('homework.edit') : t('homework.add')} description={existing ? undefined : t('homework.addNote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={busy} disabled={!valid}>{t('homework.save')}</Button></>}>
      <div className="space-y-4">
        {existing ? null : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="hf-class" label={t('homework.class')}>
              <Select id="hf-class" value={cls?.id ?? ''} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setSubjectId(''); }}>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
            <Field id="hf-section" label={t('homework.section')}>
              <Select id="hf-section" value={section?.id ?? ''} onChange={(e) => setSectionId(e.target.value)} disabled={!cls || cls.sections.length === 0}>{(cls?.sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <Field id="hf-subject" label={t('homework.subject')}>
              <Select id="hf-subject" value={subject?.id ?? ''} onChange={(e) => setSubjectId(e.target.value)} disabled={!subjects.data || subjects.data.subjects.length === 0}>{(subjects.data?.subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
          </div>
        )}
        <Field id="hf-title" label={t('homework.titleLabel')}><Input id="hf-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field id="hf-desc" label={t('homework.description')} hint={t('homework.optional')}><Textarea id="hf-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="hf-due" label={t('homework.dueDate')}><Input id="hf-due" type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field id="hf-max" label={t('homework.maxMarks')} hint={t('homework.maxMarksHint')} error={marksOk(maxMarks) ? undefined : t('homework.maxMarksInvalid')}>
            <Input id="hf-max" inputMode="numeric" dir="ltr" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
