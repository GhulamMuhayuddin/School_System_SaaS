import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, LinkIcon } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/features/auth/auth-api';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthShell } from '@/features/auth/auth-shell';
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/input';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async ({ password }: ResetPasswordValues) => {
    setFormError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (error) {
      setFormError(authErrorMessage(t, error));
    }
  };

  const back = (
    <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t('auth.backToSignIn')}
    </Link>
  );

  if (!token) {
    return (
      <AuthShell>
        <LinkIcon className="mx-auto size-10 text-amber-600" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{t('auth.resetMissingTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('auth.resetMissingBody')}</p>
        <Link to="/forgot-password" className="mt-6 inline-flex font-semibold text-brand-600 hover:text-brand-700">{t('auth.requestNewLink')}</Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div role="status">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{t('auth.resetSuccessTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('auth.resetSuccessBody')}</p>
        </div>
        {back}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t('auth.resetTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('auth.resetSubtitle')}</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5 text-start">
        {formError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">{formError}</p>}
        <Field id="password" label={t('auth.newPassword')} error={errors.password && t(errors.password.message ?? '')}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} />
        </Field>
        <Field id="confirmPassword" label={t('auth.confirmPassword')} error={errors.confirmPassword && t(errors.confirmPassword.message ?? '')}>
          <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined} {...register('confirmPassword')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{isSubmitting ? t('auth.saving') : t('auth.resetButton')}</Button>
      </form>
      {back}
    </AuthShell>
  );
}
