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
import { PageHeader, platformError } from '@/features/platform/common';
import { CATEGORIES, useCreateStaff } from '@/features/staff/staff-api';
import { GENDERS } from '@/features/students/students-api';

const today = () => new Date().toISOString().slice(0, 10);
const schema = z.object({
  employeeNo: z.string().trim().max(30).optional(),
  firstName: z.string().trim().min(1, 'platform.validation.required').max(80),
  lastName: z.string().trim().min(1, 'platform.validation.required').max(80),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  dateOfBirth: z.string().optional().refine((v) => !v || v < today(), 'platform.validation.pastDate'),
  phone: z.string().trim().min(6, 'platform.validation.phone').max(25).regex(/^[0-9+\-()\s]+$/, 'platform.validation.phone'),
  email: z.string().trim().email('platform.validation.email').or(z.literal('')).optional(),
  cnic: z.string().trim().regex(/^[0-9-]{13,15}$/, 'staff.cnicInvalid').or(z.literal('')).optional(),
  address: z.string().trim().max(300).optional(),
  category: z.enum(['TEACHING', 'ADMINISTRATIVE', 'SUPPORT']),
  designation: z.string().trim().min(1, 'platform.validation.required').max(100),
  qualification: z.string().trim().max(150).optional(),
  joiningDate: z.string().min(1, 'platform.validation.required'),
  notes: z.string().trim().max(1000).optional(),
});
type Values = z.infer<typeof schema>;

export default function StaffNewPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const create = useCreateStaff();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { gender: 'MALE', category: 'TEACHING', joiningDate: today() } });
  const e = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      const { staff } = await create.mutateAsync({
        ...v, employeeNo: v.employeeNo || undefined, dateOfBirth: v.dateOfBirth || null, email: v.email || undefined, cnic: v.cnic || undefined,
        address: v.address || undefined, qualification: v.qualification || undefined, notes: v.notes || undefined,
      });
      toast.success(t('staff.created'), staff.employeeNo);
      navigate(`/app/staff/${staff.id}`);
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('staff.title'), to: '/app/staff' }, { label: t('staff.add') }]} />
      <PageHeader title={t('staff.add')} subtitle={t('staff.addSubtitle')} />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('staff.personal')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sf-fn" label={t('platform.firstName')} error={e(errors.firstName?.message)}><Input id="sf-fn" {...register('firstName')} /></Field>
            <Field id="sf-ln" label={t('platform.lastName')} error={e(errors.lastName?.message)}><Input id="sf-ln" {...register('lastName')} /></Field>
            <Field id="sf-gender" label={t('students.gender')}><Select id="sf-gender" {...register('gender')}>{GENDERS.map((g) => <option key={g} value={g}>{t(`students.genders.${g}`)}</option>)}</Select></Field>
            <Field id="sf-dob" label={t('students.dob')} error={e(errors.dateOfBirth?.message)}><Input id="sf-dob" type="date" dir="ltr" {...register('dateOfBirth')} /></Field>
            <Field id="sf-phone" label={t('students.phone')} error={e(errors.phone?.message)}><Input id="sf-phone" dir="ltr" {...register('phone')} /></Field>
            <Field id="sf-email" label={t('platform.email')} error={e(errors.email?.message)}><Input id="sf-email" type="email" dir="ltr" {...register('email')} /></Field>
            <Field id="sf-cnic" label={t('staff.cnic')} error={e(errors.cnic?.message)}><Input id="sf-cnic" dir="ltr" placeholder="35202-1234567-1" {...register('cnic')} /></Field>
            <Field id="sf-qual" label={t('staff.qualification')}><Input id="sf-qual" {...register('qualification')} /></Field>
          </div>
          <Field id="sf-addr" label={t('platform.schools.address')}><Input id="sf-addr" {...register('address')} /></Field>
        </Card>
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-extrabold text-navy-900">{t('staff.job')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sf-cat" label={t('staff.category')}><Select id="sf-cat" {...register('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`staff.categories.${c}`)}</option>)}</Select></Field>
            <Field id="sf-des" label={t('staff.designation')} error={e(errors.designation?.message)}><Input id="sf-des" {...register('designation')} /></Field>
            <Field id="sf-join" label={t('staff.joiningDate')} error={e(errors.joiningDate?.message)}><Input id="sf-join" type="date" dir="ltr" {...register('joiningDate')} /></Field>
            <Field id="sf-no" label={t('staff.employeeNo')} hint={t('staff.employeeNoHint')}><Input id="sf-no" dir="ltr" {...register('employeeNo')} /></Field>
          </div>
          <Field id="sf-notes" label={t('admissions.notes')}><Input id="sf-notes" {...register('notes')} /></Field>
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/app/staff')}>{t('common.cancel')}</Button>
          <Button type="submit" loading={create.isPending}>{t('staff.submit')}</Button>
        </div>
      </form>
    </div>
  );
}
