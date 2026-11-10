import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Lock, Mail, Send } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { authErrorMessage } from '@/features/auth/errors';
import { AuthShell } from '@/features/auth/auth-shell';
import { loginSchema, type LoginValues } from '@/features/auth/schemas';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

const fieldClass =
  'h-[59px] w-full rounded-[15px] border border-[#d7d8fa] bg-gradient-to-br from-[#f8f8ff] to-[#f0efff] ps-[52px] pe-4 text-sm text-[#17235c] placeholder:text-[#9399b8] transition focus-visible:border-[#7455ed] focus-visible:shadow-[0_0_0_4px_rgba(119,85,237,0.1)] focus-visible:ring-0 focus-visible:ring-offset-0 aria-[invalid=true]:border-rose-500';

function IconField({ icon, error, id, children }: { icon: ReactNode; error?: string; id: string; children: ReactNode }) {
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-[#1e337f]">{icon}</span>
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 ps-4 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldClass, className)} {...rest} />;
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" /><rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" /><rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.700-.8 3.100-.8 1.400 0 1.900.8 3.200.7 1.300 0 2.100-1.200 2.900-2.300.9-1.300 1.300-2.600 1.300-2.700 0 0-2.400-.9-2.400-3.800zM14 5.300c.7-.8 1.100-1.900 1-3-1 0-2.100.7-2.800 1.500-.6.700-1.200 1.800-1 2.900 1.100.1 2.100-.6 2.800-1.400z" />
    </svg>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { remember: false } });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    try {
      await login({ email: values.email, password: values.password, remember: values.remember });
      // Return to the page the visitor originally asked for, otherwise the dashboard.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(t, error));
    }
  };
  const social = (provider: string) =>
    toast.info(t('auth.socialNotConfiguredTitle', { provider }), t('auth.socialNotConfiguredBody'));

  const providers = [
    { name: 'Google', icon: <GoogleIcon /> },
    { name: 'Microsoft', icon: <MicrosoftIcon /> },
    { name: 'Apple', icon: <AppleIcon /> },
  ];

  return (
    <AuthShell>
      <h1 className="text-[33px] font-extrabold text-[#111b55]">{t('auth.signInTitle')}</h1>
      <p className="mb-8 mt-3 text-sm text-[#59658f]">{t('auth.signInSubtitle')}</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-[17px] text-start">
        {formError && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
            {formError}
          </p>
        )}
        <IconField id="email" icon={<Mail className="size-5" aria-hidden />} error={errors.email && t(errors.email.message ?? '')}>
          <label htmlFor="email" className="sr-only">{t('auth.email')}</label>
          <TextInput id="email" type="email" autoComplete="username" placeholder={t('auth.emailPlaceholder')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} />
        </IconField>

        <IconField id="password" icon={<Lock className="size-5" aria-hidden />} error={errors.password && t(errors.password.message ?? '')}>
          <label htmlFor="password" className="sr-only">{t('auth.password')}</label>
          <TextInput id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder={t('auth.passwordPlaceholder')} className="pe-12" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-[#263d85] hover:text-[#6241e8]"
          >
            {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </IconField>

        <div className="flex items-center justify-between gap-3 pb-2 pt-1 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[#26305f]">
            <input type="checkbox" className="size-4 accent-[#6645e9]" {...register('remember')} />
            {t('auth.rememberMe')}
          </label>
          <Link to="/forgot-password" className="font-semibold text-[#6241e8] hover:underline">{t('auth.forgotPassword')}</Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-[59px] w-full items-center justify-center gap-3 rounded-[15px] bg-gradient-to-r from-[#6684ff] via-[#5144e9] to-[#7c35ed] text-[17px] font-bold text-white shadow-[0_9px_22px_rgba(86,70,224,0.25)] transition disabled:cursor-wait disabled:opacity-70 hover:-translate-y-0.5 hover:shadow-[0_12px_25px_rgba(86,70,224,0.35)]"
        >
          <Send className="size-5 rtl:-scale-x-100" aria-hidden />
          {isSubmitting ? t('auth.signingIn') : t('auth.signInButton')}
        </button>
      </form>

      <div className="mb-5 mt-[27px] flex items-center gap-3 text-xs text-[#747a9d]">
        <span aria-hidden className="h-px flex-1 bg-[#dcdcf2]" />
        {t('auth.orContinueWith')}
        <span aria-hidden className="h-px flex-1 bg-[#dcdcf2]" />
      </div>

      <div className="grid grid-cols-3 gap-[9px] max-[380px]:grid-cols-1">
        {providers.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => social(p.name)}
            className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl border border-[#e0e1f4] bg-white text-[11px] font-semibold text-[#29315e] transition hover:border-[#9480f5] hover:bg-[#f3f1ff]"
          >
            {p.icon}
            <span>{p.name}</span>
          </button>
        ))}
      </div>

      <p className="mt-[27px] flex flex-wrap items-center justify-center gap-2 text-xs text-[#646b8c]">
        {t('auth.noAccount')}
        <button
          type="button"
          onClick={() => toast.info(t('auth.registerInfoTitle'), t('auth.registerInfoBody'))}
          className="inline-flex items-center gap-1 font-semibold text-[#6241e8] hover:underline"
        >
          {t('auth.registerNow')}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </button>
      </p>
    </AuthShell>
  );
}
