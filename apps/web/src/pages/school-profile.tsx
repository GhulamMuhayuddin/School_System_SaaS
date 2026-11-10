import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { PageHeader, platformError } from '@/features/platform/common';
import { useProfile, useUpdateProfile, type Profile } from '@/features/school/school-api';

const ZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'America/New_York', 'UTC'];
const schema = z.object({
  name: z.string().trim().min(1, 'platform.validation.required').max(150),
  email: z.string().trim().email('platform.validation.email').or(z.literal('')),
  phone: z.string().trim().max(40),
  city: z.string().trim().max(100),
  address: z.string().trim().max(300),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;

function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateProfile();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: profile.name, email: profile.email ?? '', phone: profile.phone ?? '', city: profile.city ?? '', address: profile.address ?? '', timezone: profile.timezone },
  });
  const zones = ZONES.includes(profile.timezone) ? ZONES : [profile.timezone, ...ZONES];
  const e = (m?: string) => (m ? t(m) : undefined);
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    try {
      await update.mutateAsync({ name: v.name, email: v.email || null, phone: v.phone || null, city: v.city || null, address: v.address || null, timezone: v.timezone });
      toast.success(t('platform.detail.saved'));
    } catch (err) {
      setServerError(platformError(t, err));
    }
  });
  return (
    <Card className="max-w-2xl p-6">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{serverError}</p>}
        <Field id="sp-name" label={t('platform.schools.name')} error={e(errors.name?.message)}><Input id="sp-name" {...register('name')} /></Field>
        <Field id="sp-code" label={t('platform.schools.code')} hint={t('schoolAdmin.profile.codeHint')}><Input id="sp-code" value={profile.code} readOnly disabled dir="ltr" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sp-email" label={t('platform.schools.email')} error={e(errors.email?.message)}><Input id="sp-email" type="email" dir="ltr" {...register('email')} /></Field>
          <Field id="sp-phone" label={t('platform.schools.phone')}><Input id="sp-phone" dir="ltr" {...register('phone')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sp-city" label={t('platform.schools.city')}><Input id="sp-city" {...register('city')} /></Field>
          <Field id="sp-tz" label={t('platform.detail.timezone')}><Select id="sp-tz" {...register('timezone')}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
        </div>
        <Field id="sp-address" label={t('platform.schools.address')}><Input id="sp-address" {...register('address')} /></Field>
        <div className="flex justify-end"><Button type="submit" loading={update.isPending} disabled={!isDirty}>{t('platform.save')}</Button></div>
      </form>
    </Card>
  );
}

export default function SchoolProfilePage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useProfile();
  return (
    <div>
      <PageHeader title={t('schoolAdmin.profile.title')} subtitle={t('schoolAdmin.profile.subtitle')} />
      {error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => void refetch()} />
        : isLoading || !data ? <Skeleton className="h-80 max-w-2xl" /> : <ProfileForm profile={data} />}
    </div>
  );
}
