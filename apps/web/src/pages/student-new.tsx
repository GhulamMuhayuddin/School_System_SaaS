import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { PageHeader, platformError } from '@/features/platform/common';
import { GENDERS, RELATIONS, useCreateStudent, useStudentOptions } from '@/features/students/students-api';

const phone = z.string().trim().min(6, 'platform.validation.phone').max(25).regex(/^[0-9+\-()\s]+$/, 'platform.validation.phone');
const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  admissionNo: z.string().trim().max(30).optional(),
  firstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  lastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.string().min(1, 'platform.validation.required').refine((v) => v < today(), 'platform.validation.pastDate'),
  bloodGroup: z.string().trim().max(5).optional(),
  phone: z.union([phone, z.literal('')]).optional(),
  address: z.string().trim().max(300).optional(),
  previousSchool: z.string().trim().max(150).optional(),
  classId: z.string().uuid('platform.validation.required'),
  sectionId: z.string().optional(),
  admissionDate: z.string().min(1, 'platform.validation.required'),
  guardians: z.array(z.object({
    name: z.string().trim().min(1, 'platform.validation.required').max(120),
    phone,
    email: z.string().trim().email('platform.validation.email').or(z.literal('')).optional(),
    occupation: z.string().trim().max(100).optional(),
    relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
  })).min(1).max(5),
  primary: z.number().int().min(0),
});
type Values = z.infer<typeof schema>;

export default function StudentNewPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const options = useStudentOptions();
  const create = useCreateStudent();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { gender: 'MALE', admissionDate: today(), guardians: [{ name: '', phone: '', relation: 'FATHER' }], primary: 0 },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'guardians' });
  const classId = watch('classId');
  const primary = Number(watch('primary'));
  const sections = options.data?.find((c) => c.id === classId)?.sections ?? [];
  const e = (m?: string) => (m ? t(m) : undefined);

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const { student } = await create.mutateAsync({
        admissionNo: v.admissionNo || undefined, firstName: v.firstName, lastName: v.lastName, gender: v.gender, dateOfBirth: v.dateOfBirth,
        bloodGroup: v.bloodGroup || undefined, phone: v.phone || undefined, address: v.address || undefined, previousSchool: v.previousSchool || undefined,
        classId: v.classId, sectionId: v.sectionId || null, admissionDate: v.admissionDate,
        guardians: v.guardians.map((g, i) => ({ ...g, email: g.email || undefined, occupation: g.occupation || undefined, isPrimary: i === v.primary })),
      });
      toast.success(t('students.created'), `${student.firstName} ${student.lastName} · ${student.admissionNo}`);
      navigate(`/app/students/${student.id}`);
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('students.title'), to: '/app/students' }, { label: t('students.add') }]} />
      <PageHeader title={t('students.add')} subtitle={t('students.addSubtitle')} />
      {options.data && options.data.length === 0 && (
        <p role="status" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('students.noClasses')}</p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}

        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('students.personal')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sn-fn" label={t('platform.firstName')} error={e(errors.firstName?.message)}><Input id="sn-fn" {...register('firstName')} /></Field>
            <Field id="sn-ln" label={t('platform.lastName')} error={e(errors.lastName?.message)}><Input id="sn-ln" {...register('lastName')} /></Field>
            <Field id="sn-gender" label={t('students.gender')}><Select id="sn-gender" {...register('gender')}>{GENDERS.map((g) => <option key={g} value={g}>{t(`students.genders.${g}`)}</option>)}</Select></Field>
            <Field id="sn-dob" label={t('students.dob')} error={e(errors.dateOfBirth?.message)}><Input id="sn-dob" type="date" dir="ltr" {...register('dateOfBirth')} /></Field>
            <Field id="sn-blood" label={t('students.bloodGroup')}><Input id="sn-blood" dir="ltr" placeholder="B+" {...register('bloodGroup')} /></Field>
            <Field id="sn-phone" label={t('students.phone')} error={e(errors.phone?.message)}><Input id="sn-phone" dir="ltr" {...register('phone')} /></Field>
          </div>
          <Field id="sn-address" label={t('platform.schools.address')}><Input id="sn-address" {...register('address')} /></Field>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('students.admission')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sn-class" label={t('students.class')} error={e(errors.classId?.message)}>
              <Select id="sn-class" defaultValue="" {...register('classId', { onChange: () => setValue('sectionId', '') })}>
                <option value="" disabled>{t('students.chooseClass')}</option>
                {(options.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field id="sn-section" label={t('students.section')}>
              <Select id="sn-section" defaultValue="" disabled={!classId} {...register('sectionId')}>
                <option value="">{t('students.noSection')}</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field id="sn-adate" label={t('students.admissionDate')} error={e(errors.admissionDate?.message)}><Input id="sn-adate" type="date" dir="ltr" {...register('admissionDate')} /></Field>
            <Field id="sn-no" label={t('students.admissionNo')} hint={t('students.admissionNoHint')}><Input id="sn-no" dir="ltr" {...register('admissionNo')} /></Field>
          </div>
          <Field id="sn-prev" label={t('students.previousSchool')}><Input id="sn-prev" {...register('previousSchool')} /></Field>
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-navy-900">{t('students.guardians')}</h2>
            {fields.length < 5 && <Button type="button" size="sm" variant="secondary" onClick={() => append({ name: '', phone: '', relation: 'MOTHER' })}><Plus className="size-4" aria-hidden />{t('students.addGuardian')}</Button>}
          </div>
          <p className="text-xs text-muted">{t('students.guardianNote')}</p>
          {fields.map((f, i) => (
            <fieldset key={f.id} className="space-y-4 rounded-control border border-line p-4">
              <legend className="flex items-center gap-3 px-1 text-sm font-bold text-navy-900">
                {t('students.guardianN', { n: i + 1 })}
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <input type="radio" className="accent-brand-600" checked={primary === i} onChange={() => setValue('primary', i)} />{t('students.primary')}
                </label>
                {fields.length > 1 && (
                  <button type="button" aria-label={t('students.removeGuardian')} className="text-rose-600 hover:text-rose-700" onClick={() => { remove(i); if (primary >= fields.length - 1) setValue('primary', 0); }}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`g${i}-name`} label={t('platform.admins.name')} error={e(errors.guardians?.[i]?.name?.message)}><Input id={`g${i}-name`} {...register(`guardians.${i}.name`)} /></Field>
                <Field id={`g${i}-rel`} label={t('students.relation')}><Select id={`g${i}-rel`} {...register(`guardians.${i}.relation`)}>{RELATIONS.map((r) => <option key={r} value={r}>{t(`students.relations.${r}`)}</option>)}</Select></Field>
                <Field id={`g${i}-phone`} label={t('students.phone')} error={e(errors.guardians?.[i]?.phone?.message)}><Input id={`g${i}-phone`} dir="ltr" {...register(`guardians.${i}.phone`)} /></Field>
                <Field id={`g${i}-email`} label={t('platform.email')} error={e(errors.guardians?.[i]?.email?.message)}><Input id={`g${i}-email`} type="email" dir="ltr" {...register(`guardians.${i}.email`)} /></Field>
                <Field id={`g${i}-occ`} label={t('students.occupation')}><Input id={`g${i}-occ`} {...register(`guardians.${i}.occupation`)} /></Field>
              </div>
            </fieldset>
          ))}
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/app/students')}>{t('common.cancel')}</Button>
          <Button type="submit" loading={create.isPending}>{t('students.save')}</Button>
        </div>
      </form>
    </div>
  );
}
