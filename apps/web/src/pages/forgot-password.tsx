import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/features/auth/auth-api';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthShell } from '@/features/auth/auth-shell';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async ({ email }: ForgotPasswordValues) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(email);
      setSent(true); // the API answers the same whether or not the email exists, and so does this page
    } catch (error) {
      setFormError(authErrorMessage(t, error));
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div role="status" className="py-2">
          <MailCheck className="mx-auto size-10 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{t('auth.forgotSentTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('auth.forgotSentBody')}</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t('auth.forgotTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.forgotSubtitle')}</p>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5 text-start">
            {formError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">{formError}</p>}
            <Field id="email" label={t('auth.email')} error={errors.email && t(errors.email.message ?? '')}>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{isSubmitting ? t('auth.sending') : t('auth.sendLink')}</Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('auth.backToSignIn')}
      </Link>
    </AuthShell>
  );
}
