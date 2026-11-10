import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PrintFrame, type Letterhead, type PrintLang } from '@/components/print/print-frame';
import { ErrorState, Spinner } from '@/components/ui/states';
import { platformError } from '@/features/platform/common';
import { useLetterhead, type PrintT } from '@/features/print/print-api';
import { useStudents, type StudentRow } from '@/features/students/students-api';

export function IdCard({ school, s, tt }: { school: Letterhead; s: StudentRow; tt: PrintT }) {
  return (
    <div className="print-avoid flex h-[54mm] w-[85.6mm] flex-col overflow-hidden rounded-lg border-2 border-black text-[10px] leading-tight">
      <div className="bg-black px-2 py-1 text-center text-white"><p className="text-[11px] font-extrabold uppercase tracking-wide">{school.name}</p><p>{tt('print.idcard.title')}</p></div>
      <div className="flex flex-1 gap-2 p-2">
        <div className="flex h-[26mm] w-[21mm] shrink-0 items-center justify-center border border-dashed border-gray-500 text-center text-[8px] text-gray-500">{tt('print.idcard.photo')}</div>
        <dl className="min-w-0 flex-1 space-y-0.5">
          <div><dt className="text-gray-600">{tt('print.idcard.name')}</dt><dd className="truncate text-[12px] font-extrabold">{s.firstName} {s.lastName}</dd></div>
          <div className="flex gap-3"><div><dt className="text-gray-600">{tt('print.idcard.class')}</dt><dd className="font-bold">{s.class.name}{s.section ? ` – ${s.section.name}` : ''}</dd></div><div><dt className="text-gray-600">{tt('print.idcard.admissionNo')}</dt><dd className="font-bold" dir="ltr">{s.admissionNo}</dd></div></div>
          {s.primaryGuardian ? <div><dt className="text-gray-600">{tt('print.idcard.guardian')}</dt><dd className="truncate font-bold">{s.primaryGuardian.name} · <span dir="ltr">{s.primaryGuardian.phone}</span></dd></div> : null}
        </dl>
      </div>
      <p className="border-t border-gray-400 px-2 py-0.5 text-center text-[8px] text-gray-600" dir="ltr">{[school.phone, school.city].filter(Boolean).join(' · ')}</p>
    </div>
  );
}

/** ID cards of the active students of a class or section (?classId, ?sectionId), 85.6 x 54 mm, ten per A4 page. */
export default function IdCardsPrintPage() {
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<PrintLang>(i18n.language === 'ur' ? 'ur' : 'en');
  const students = useStudents({ classId: params.get('classId') || undefined, sectionId: params.get('sectionId') || undefined, status: 'ACTIVE' });
  const school = useLetterhead();
  const err = students.error ?? school.error;
  if (err) return <ErrorState title={t('platform.errors.generic')} description={platformError(t, err)} onRetry={() => { void students.refetch(); void school.refetch(); }} />;
  if (!students.data || !school.data) return <Spinner />;
  const tt = i18n.getFixedT(lang) as unknown as PrintT;
  const rows = students.data.students;
  return (
    <PrintFrame lang={lang} onLang={setLang} backTo="/app/students">
      {rows.length === 0 ? <p className="no-print text-sm text-muted">{t('print.idcard.none')}</p> : (
        <div className="grid justify-center gap-3" style={{ gridTemplateColumns: 'repeat(2, 85.6mm)' }}>
          {rows.map((s) => <IdCard key={s.id} school={school.data} s={s} tt={tt} />)}
        </div>
      )}
    </PrintFrame>
  );
}
