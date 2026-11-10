import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useCreateApplication } from '@/features/admissions/admissions-api';
import { PageHeader, platformError } from '@/features/platform/common';
import { GENDERS, RELATIONS, useStudentOptions } from '@/features/students/students-api';

const phone = z.string().trim().min(6, 'platform.validation.phone').max(25).regex(/^[0-9+\-()\s]+$/, 'platform.validation.phone');
const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  firstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  lastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.string().min(1, 'platform.validation.required').refine((v) => v < today(), 'platform.validation.pastDate'),
  bloodGroup: z.string().trim().max(5).optional(),
  previousSchool: z.string().trim().max(150).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  appliedClassId: z.string().uuid('platform.validation.required'),
  applicationDate: z.string().min(1, 'platform.validation.required'),
  guardianName: z.string().trim().min(1, 'platform.validation.required').max(120),
  guardianPhone: phone,
  guardianEmail: z.string().trim().email('platform.validation.email').or(z.literal('')).optional(),
  guardianRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
  guardianOccupation: z.string().trim().max(100).optional(),
});
type Values = z.infer<typeof schema>;

export default function AdmissionNewPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const options = useStudentOptions();
  const create = useCreateApplication();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { gender: 'MALE', guardianRelation: 'FATHER', applicationDate: today() },
  });
  const e = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const { application } = await create.mutateAsync({
        ...v, bloodGroup: v.bloodGroup || undefined, previousSchool: v.previousSchool || undefined, address: v.address || undefined, notes: v.notes || undefined,
        guardianEmail: v.guardianEmail || undefined, guardianOccupation: v.guardianOccupation || undefined,
      });
      toast.success(t('admissions.created'), application.applicationNo);
      navigate(`/app/admissions/${application.id}`);
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('admissions.title'), to: '/app/admissions' }, { label: t('admissions.add') }]} />
      <PageHeader title={t('admissions.add')} subtitle={t('admissions.addSubtitle')} />
      {options.data && options.data.length === 0 && <p role="status" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('students.noClasses')}</p>}
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('admissions.applicant')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ap-fn" label={t('platform.firstName')} error={e(errors.firstName?.message)}><Input id="ap-fn" {...register('firstName')} /></Field>
            <Field id="ap-ln" label={t('platform.lastName')} error={e(errors.lastName?.message)}><Input id="ap-ln" {...register('lastName')} /></Field>
            <Field id="ap-gender" label={t('students.gender')}><Select id="ap-gender" {...register('gender')}>{GENDERS.map((g) => <option key={g} value={g}>{t(`students.genders.${g}`)}</option>)}</Select></Field>
            <Field id="ap-dob" label={t('students.dob')} error={e(errors.dateOfBirth?.message)}><Input id="ap-dob" type="date" dir="ltr" {...register('dateOfBirth')} /></Field>
            <Field id="ap-class" label={t('admissions.appliedClass')} error={e(errors.appliedClassId?.message)}>
              <Select id="ap-class" defaultValue="" {...register('appliedClassId')}>
                <option value="" disabled>{t('students.chooseClass')}</option>
                {(options.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field id="ap-date" label={t('admissions.appliedOn')} error={e(errors.applicationDate?.message)}><Input id="ap-date" type="date" dir="ltr" {...register('applicationDate')} /></Field>
            <Field id="ap-blood" label={t('students.bloodGroup')}><Input id="ap-blood" dir="ltr" {...register('bloodGroup')} /></Field>
            <Field id="ap-prev" label={t('students.previousSchool')}><Input id="ap-prev" {...register('previousSchool')} /></Field>
          </div>
          <Field id="ap-addr" label={t('platform.schools.address')}><Input id="ap-addr" {...register('address')} /></Field>
          <Field id="ap-notes" label={t('admissions.notes')}><Input id="ap-notes" {...register('notes')} /></Field>
        </Card>
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('admissions.guardian')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ap-gn" label={t('platform.admins.name')} error={e(errors.guardianName?.message)}><Input id="ap-gn" {...register('guardianName')} /></Field>
            <Field id="ap-gr" label={t('students.relation')}><Select id="ap-gr" {...register('guardianRelation')}>{RELATIONS.map((r) => <option key={r} value={r}>{t(`students.relations.${r}`)}</option>)}</Select></Field>
            <Field id="ap-gp" label={t('students.phone')} error={e(errors.guardianPhone?.message)}><Input id="ap-gp" dir="ltr" {...register('guardianPhone')} /></Field>
            <Field id="ap-ge" label={t('platform.email')} error={e(errors.guardianEmail?.message)}><Input id="ap-ge" type="email" dir="ltr" {...register('guardianEmail')} /></Field>
            <Field id="ap-go" label={t('students.occupation')}><Input id="ap-go" {...register('guardianOccupation')} /></Field>
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/app/admissions')}>{t('common.cancel')}</Button>
          <Button type="submit" loading={create.isPending}>{t('admissions.submit')}</Button>
        </div>
      </form>
    </div>
  );
}
