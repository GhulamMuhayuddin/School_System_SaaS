import type { ReactNode } from 'react';
import {
  BarChart3, BookOpenCheck, CalendarCheck, CalendarDays, CheckCircle2, GraduationCap, Info, Megaphone,
  Presentation, Receipt, Trophy, TrendingUp, UserPlus, Users, Wallet, Zap, type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';
import { DonutChart, LineChart, Sparkline } from '@/features/dashboard/charts';
import {
  sampleActivities, sampleEvents, sampleFees, samplePerformance, sampleStats, sampleTopClasses,
} from '@/features/dashboard/sample-data';
import { useNow } from '@/features/dashboard/use-now';

/**
 * Dashboard DESIGN PREVIEW. Every number comes from features/dashboard/sample-data.ts and the page
 * says so on screen. Phase 4 connects this layout to real data and removes the notice.
 */

function Panel({ title, icon: Icon, children, className }: { title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <h2 className="text-base font-extrabold text-navy-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

const statThemes = {
  blue: { card: 'from-blue-50 via-white to-white', tile: 'from-blue-500 to-blue-700', stroke: '#2F62E8', trend: 'text-blue-700' },
  emerald: { card: 'from-emerald-50 via-white to-white', tile: 'from-emerald-400 to-emerald-600', stroke: '#10B981', trend: 'text-emerald-700' },
  orange: { card: 'from-orange-50 via-white to-white', tile: 'from-orange-400 to-orange-600', stroke: '#F97316', trend: 'text-orange-700' },
  violet: { card: 'from-violet-50 via-white to-white', tile: 'from-violet-500 to-violet-700', stroke: '#7C3AED', trend: 'text-violet-700' },
} as const;

interface StatCardProps {
  label: string;
  value: string;
  trend: string;
  icon: LucideIcon;
  spark: readonly number[];
  theme: keyof typeof statThemes;
}

function StatCard({ label, value, trend, icon: Icon, spark, theme }: StatCardProps) {
  const style = statThemes[theme];
  return (
    <div className={cn('relative overflow-hidden rounded-card bg-gradient-to-br p-5 shadow-card ring-1 ring-black/5', style.card)}>
      <div className="relative z-10 flex items-center gap-4">
        <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', style.tile)}>
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-muted">{label}</p>
          <p className="text-2xl font-extrabold tracking-tight text-navy-900">{value}</p>
          <p className={cn('mt-0.5 inline-flex items-center gap-1 text-xs font-bold', style.trend)}>
            <TrendingUp className="size-3.5 rtl:scale-x-[-1]" aria-hidden />
            {trend}
          </p>
        </div>
      </div>
      <Sparkline values={spark} color={style.stroke} className="pointer-events-none absolute bottom-2 end-3 h-12 w-28 opacity-90" />
    </div>
  );
}

const activityStyles = {
  admission: { icon: UserPlus, tone: 'bg-emerald-50 text-emerald-600' },
  payment: { icon: Wallet, tone: 'bg-blue-50 text-blue-600' },
  attendance: { icon: CheckCircle2, tone: 'bg-violet-50 text-violet-600' },
  notice: { icon: Megaphone, tone: 'bg-orange-50 text-orange-600' },
} as const;

const quickActions: { key: string; labelKey: string; icon: LucideIcon; tone: string }[] = [
  { key: 'addStudent', labelKey: 'dashboard.quick.addStudent', icon: UserPlus, tone: 'bg-blue-50 text-blue-700' },
  { key: 'recordAttendance', labelKey: 'dashboard.quick.recordAttendance', icon: CalendarCheck, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'generateChallan', labelKey: 'dashboard.quick.generateChallan', icon: Receipt, tone: 'bg-orange-50 text-orange-700' },
  { key: 'publishResults', labelKey: 'dashboard.quick.publishResults', icon: Trophy, tone: 'bg-violet-50 text-violet-700' },
  { key: 'addHomework', labelKey: 'dashboard.quick.addHomework', icon: BookOpenCheck, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'viewReports', labelKey: 'dashboard.quick.viewReports', icon: BarChart3, tone: 'bg-violet-50 text-violet-700' },
];

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const now = useNow();
  const locale = i18n.language === 'ur' ? 'ur-PK' : 'en-GB';
  const number = new Intl.NumberFormat(locale);
  const money = (amount: number) => `PKR ${number.format(amount)}`;
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const hour = now.getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const months = Array.from({ length: 6 }, (_, i) => monthShort.format(new Date(2026, i, 1)));

  const feeTotal = sampleFees.collected + sampleFees.pending;
  const feePercent = (sampleFees.collected / feeTotal) * 100;

  const activityText = (item: (typeof sampleActivities)[number]) => {
    switch (item.key) {
      case 'admission':
        return { title: t('dashboard.recent.admissionTitle'), body: t('dashboard.recent.admissionBody', { name: item.name }) };
      case 'payment':
        return { title: t('dashboard.recent.paymentTitle'), body: t('dashboard.recent.paymentBody', { amount: money(item.amount), name: item.name }) };
      case 'attendance':
        return { title: t('dashboard.recent.attendanceTitle'), body: t('dashboard.recent.attendanceBody', { class: item.className }) };
      default:
        return { title: t('dashboard.recent.noticeTitle'), body: t('dashboard.recent.noticeBody') };
    }
  };

  return (
    <div className="space-y-6">
      <div role="note" className="flex items-start gap-3 rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-bold">{t('dashboard.sample.tag')}: </span>
          {t('dashboard.sample.banner')}
        </p>
      </div>

      <section className="relative overflow-hidden rounded-card bg-gradient-to-r from-brand-50 via-violet-50 to-sky-50 p-6 shadow-card ring-1 ring-black/5 sm:p-8">
        <div className="pointer-events-none absolute -end-12 -top-16 size-64 rounded-full bg-violet-200/50 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 end-1/3 size-56 rounded-full bg-sky-200/50 blur-3xl" aria-hidden />
        <GraduationCap className="pointer-events-none absolute bottom-2 end-1/4 hidden size-32 text-brand-200/60 lg:block" aria-hidden />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/30">
              <GraduationCap className="size-9" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
                {t(`dashboard.greeting.${greeting}`)}{user ? `, ${user.firstName}` : ''} <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-base text-muted">{t('dashboard.welcome')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 self-start rounded-card bg-white/80 px-5 py-3 shadow-card ring-1 ring-black/5 backdrop-blur sm:self-auto">
            <CalendarDays className="size-6 text-brand-600" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-muted">
                {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(now)}
              </p>
              <p className="text-2xl font-extrabold text-navy-900">
                {new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(now)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('nav.dashboard')}>
        <StatCard theme="blue" icon={Users} label={t('dashboard.stats.students')} value={number.format(sampleStats.students.value)} trend={`${sampleStats.students.trend}%`} spark={sampleStats.students.spark} />
        <StatCard theme="emerald" icon={Presentation} label={t('dashboard.stats.teachers')} value={number.format(sampleStats.teachers.value)} trend={`${sampleStats.teachers.trend}%`} spark={sampleStats.teachers.spark} />
        <StatCard theme="orange" icon={Wallet} label={t('dashboard.stats.fees')} value={money(sampleStats.fees.value)} trend={`${sampleStats.fees.trend}%`} spark={sampleStats.fees.spark} />
        <StatCard theme="violet" icon={CalendarCheck} label={t('dashboard.stats.attendance')} value={`${sampleStats.attendance.value}%`} trend={`${sampleStats.attendance.trend}%`} spark={sampleStats.attendance.spark} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <Panel title={t('dashboard.performance.title')} icon={BarChart3} className="lg:col-span-2 xl:col-span-6">
          <LineChart
            labels={months}
            ariaLabel={t('dashboard.performance.chartLabel')}
            series={[
              { key: 'results', name: t('dashboard.performance.results'), color: '#2F62E8', values: samplePerformance.results },
              { key: 'attendance', name: t('dashboard.performance.attendance'), color: '#10B981', values: samplePerformance.attendance },
              { key: 'fees', name: t('dashboard.performance.fees'), color: '#7C3AED', values: samplePerformance.fees },
            ]}
          />
        </Panel>

        <Panel title={t('dashboard.quick.title')} icon={Zap} className="xl:col-span-3">
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map(({ key, labelKey, icon: Icon, tone }) => (
              <button
                key={key}
                type="button"
                disabled
                title={t('nav.soonHint')}
                className={cn('flex min-h-[88px] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-control px-2 py-3 text-center text-sm font-bold leading-tight', tone)}
              >
                <Icon className="size-6" aria-hidden />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t('dashboard.quick.note')}</p>
        </Panel>

        <Panel title={t('dashboard.recent.title')} icon={Megaphone} className="xl:col-span-3">
          <ol className="space-y-4">
            {sampleActivities.map((item) => {
              const { icon: Icon, tone } = activityStyles[item.key];
              const text = activityText(item);
              return (
                <li key={item.key} className="flex items-start gap-3">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy-900">{text.title}</p>
                    <p className="truncate text-sm text-muted">{text.body}</p>
                    <p className="text-xs text-muted/80">{relative.format(-item.minutesAgo, 'minute')}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('dashboard.topClasses.title')} icon={Trophy}>
          <ul className="space-y-4">
            {sampleTopClasses.map((item) => (
              <li key={item.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-navy-900">{t('dashboard.topClasses.class', { name: item.name })}</span>
                  <span className="font-extrabold text-navy-900">{item.score}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${item.score}%`, backgroundColor: item.color }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t('dashboard.feeStatus.title')} icon={Wallet}>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <DonutChart
              percent={feePercent}
              label={t('dashboard.feeStatus.percentLabel')}
              ariaLabel={`${t('dashboard.feeStatus.collected')}: ${Math.round(feePercent)}%`}
              color="#10B981"
              trackColor="#FDE3B5"
            />
            <dl className="space-y-3 text-sm">
              {[
                { label: t('dashboard.feeStatus.collected'), value: sampleFees.collected, dot: 'bg-emerald-500' },
                { label: t('dashboard.feeStatus.pending'), value: sampleFees.pending, dot: 'bg-orange-400' },
                { label: t('dashboard.feeStatus.total'), value: feeTotal, dot: 'bg-slate-300' },
              ].map((row) => (
                <div key={row.label}>
                  <dt className="flex items-center gap-2 text-muted"><span className={cn('size-2.5 rounded-full', row.dot)} aria-hidden />{row.label}</dt>
                  <dd className="ps-[18px] font-extrabold text-navy-900">{money(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>

        <Panel title={t('dashboard.events.title')} icon={CalendarDays}>
          <ul className="space-y-4">
            {sampleEvents.map((event) => {
              const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + event.daysFromNow);
              return (
                <li key={event.key} className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-control bg-brand-50 text-brand-700">
                    <span className="text-lg font-extrabold leading-none">{date.getDate()}</span>
                    <span className="text-[11px] font-bold uppercase">{monthShort.format(date)}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy-900">{t(`dashboard.events.${event.key}`)}</p>
                    <p className="text-sm text-muted">{event.time ?? t('dashboard.events.allDay')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
