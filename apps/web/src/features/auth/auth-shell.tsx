import type { ReactNode } from 'react';
import { BookOpen, CalendarCheck, ChartNoAxesCombined, CreditCard, GraduationCap, Headset, ShieldCheck, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '@/components/layout/language-switcher';

/**
 * Shared frame for login / forgot / reset pages (split layout: photo + features on the left, card on the right).
 * Background: the bundled university-building scene public/login-scene.svg.
 * To use a real photo of your campus, put it at public/login-bg.jpg (it is tried first, no code change needed).
 */
const PHOTO = "url('/login-bg.jpg'), url('/login-scene.svg')";

export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const features = [
    { icon: GraduationCap, title: t('auth.featStudentsTitle'), body: t('auth.featStudentsBody') },
    { icon: Users, title: t('auth.featTeachersTitle'), body: t('auth.featTeachersBody') },
    { icon: CalendarCheck, title: t('auth.featAttendanceTitle'), body: t('auth.featAttendanceBody') },
    { icon: CreditCard, title: t('auth.featFeesTitle'), body: t('auth.featFeesBody') },
    { icon: ChartNoAxesCombined, title: t('auth.featReportsTitle'), body: t('auth.featReportsBody') },
  ];
  const benefits = [
    { icon: ShieldCheck, label: t('auth.featureSecure') },
    { icon: Zap, label: t('auth.featureFast') },
    { icon: Headset, label: t('auth.featureSupport') },
  ];

  return (
    <div className="grid min-h-screen bg-gradient-to-br from-[#e7eaff] via-[#f8f5ff] to-[#e9e7ff] md:grid-cols-[48%_52%] lg:grid-cols-[56%_44%]">
      {/* LEFT: visual */}
      <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-[#a7b9ff] via-[#d7caff] to-[#f0eaff] px-10 py-9 md:block">
        <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: PHOTO }} />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg,rgba(235,237,255,.98) 0%,rgba(230,232,255,.25) 32%,rgba(30,48,130,.08) 65%,rgba(16,28,95,.85) 100%)' }}
        />

        <div className="relative z-[3] flex items-center gap-4">
          <BookOpen className="size-12 text-[#1255d9]" aria-hidden />
          <div>
            <p className="text-[39px] font-extrabold leading-tight text-[#101a54]">Nexora</p>
            <p className="text-[21px] font-semibold leading-tight text-[#1856d7]">School ERP</p>
          </div>
          <div aria-hidden className="mx-3 h-[60px] w-0.5 bg-[#354b9b]" />
          <p className="hidden text-base font-semibold leading-relaxed text-[#17235c] lg:block">
            {t('auth.heroTitle')}
            <br />
            {t('auth.heroSubtitle')}
          </p>
        </div>

        <ul className="absolute end-7 top-[37%] z-[3] flex flex-col gap-3 max-lg:end-3">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex w-[225px] items-center gap-3 rounded-[15px] bg-white/85 p-3 shadow-[0_5px_20px_rgba(42,52,128,0.13)] backdrop-blur-md">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-[#e6eaff] text-[#3156ed]">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <strong className="block text-xs text-[#17235c]">{title}</strong>
                <small className="text-[10px] text-[#667096]">{body}</small>
              </div>
            </li>
          ))}
        </ul>

        <div className="absolute inset-x-0 bottom-0 z-[3] flex min-h-[105px] items-center justify-around rounded-[45%_8%_0_0/18%_10%_0_0] bg-gradient-to-br from-[#111d79] via-[#254edc] to-[#6e4ce9] px-8 py-5 text-white">
          {benefits.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 text-xs font-semibold">
              <Icon className="size-7" aria-hidden />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* RIGHT: form */}
      <section className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_100%_0%,#dcd2ff,transparent_38%),linear-gradient(135deg,#f8f7ff,#e9eaff)] px-[18px] pb-16 pt-[85px] md:px-[30px] md:py-[70px]">
        <LanguageSelect className="absolute end-[18px] top-[18px] md:end-[30px] md:top-6" />

        <div className="w-full max-w-[490px] rounded-[27px] border border-white bg-white/90 px-[23px] py-9 text-center shadow-[0_20px_70px_rgba(62,59,153,0.12)] backdrop-blur-xl md:px-[35px] md:py-10">
          <div className="relative mb-3.5 inline-flex text-[#1457dc]">
            <BookOpen className="size-[58px]" aria-hidden />
            <GraduationCap className="absolute -top-3 start-[15px] size-7 text-[#18205c]" aria-hidden />
          </div>
          {children}
        </div>

        <p className="absolute bottom-4 px-4 text-center text-[10px] text-[#8589aa]">{t('auth.copyright')}</p>
      </section>
    </div>
  );
}
